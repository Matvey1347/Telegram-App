import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvestmentMovementType,
  InvestmentOrigin,
  MemberCompensationSettlementType,
  Prisma,
  TelegramAdSalePaymentStatus,
  WorkspaceRole,
} from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { roundMoney, salesCommission } from './member-finance-calculations';

export type MemberFinanceReader = Pick<
  Prisma.TransactionClient,
  'telegramAdSalePayment' | 'memberCompensationSettlement' | 'investment'
>;

type MemberTotals = {
  commissionEarned: number;
  commissionSettled: number;
  external: number;
  salary: number;
  reinvestment: number;
};

@Injectable()
export class MemberFinanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private signedInvestment(row: {
    amountInPrimaryCurrency: unknown;
    movementType: InvestmentMovementType;
  }) {
    const value = Number(row.amountInPrimaryCurrency ?? 0);
    return row.movementType === InvestmentMovementType.WITHDRAWAL
      ? -value
      : value;
  }

  async summaryRows(
    workspaceId: string,
    memberIds?: string[],
    client: MemberFinanceReader = this.prisma,
  ) {
    const memberFilter = memberIds?.length ? { in: memberIds } : undefined;
    const [payments, settlements, investments] = await Promise.all([
      client.telegramAdSalePayment.findMany({
        where: {
          workspaceId,
          status: TelegramAdSalePaymentStatus.ACTIVE,
          sale: {
            sellerMemberId: memberFilter,
            sellerCommissionEnabled: true,
          },
        },
        select: {
          id: true,
          paidAt: true,
          amountInPrimaryCurrency: true,
          sale: {
            select: {
              id: true,
              title: true,
              advertiserName: true,
              sellerMemberId: true,
              sellerCommissionRate: true,
            },
          },
        },
      }),
      client.memberCompensationSettlement.findMany({
        where: { workspaceId, workspaceMemberId: memberFilter },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      client.investment.findMany({
        where: { workspaceId, workspaceMemberId: memberFilter },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const byMember = new Map<string, MemberTotals>();
    const get = (id: string) => {
      const current = byMember.get(id) ?? {
        commissionEarned: 0,
        commissionSettled: 0,
        external: 0,
        salary: 0,
        reinvestment: 0,
      };
      byMember.set(id, current);
      return current;
    };
    for (const payment of payments) {
      const memberId = payment.sale.sellerMemberId;
      if (!memberId) continue;
      get(memberId).commissionEarned += salesCommission(
        Number(payment.amountInPrimaryCurrency),
        Number(payment.sale.sellerCommissionRate),
      );
    }
    for (const settlement of settlements) {
      get(settlement.workspaceMemberId).commissionSettled += Number(
        settlement.amountInPrimaryCurrency,
      );
    }
    for (const investment of investments) {
      const value = this.signedInvestment(investment);
      const row = get(investment.workspaceMemberId);
      if (investment.origin === InvestmentOrigin.SALARY) row.salary += value;
      else if (investment.origin === InvestmentOrigin.REINVESTMENT)
        row.reinvestment += value;
      else row.external += value;
    }
    return { byMember, payments, settlements, investments };
  }

  private presentSummary(
    memberId: string,
    primaryCurrency: string,
    values?: MemberTotals,
  ) {
    const row = values ?? {
      commissionEarned: 0,
      commissionSettled: 0,
      external: 0,
      salary: 0,
      reinvestment: 0,
    };
    const invested = row.external + row.salary + row.reinvestment;
    return {
      memberId,
      primaryCurrency,
      commissionEarned: roundMoney(row.commissionEarned),
      commissionSettled: roundMoney(row.commissionSettled),
      commissionPayable: roundMoney(
        Math.max(0, row.commissionEarned - row.commissionSettled),
      ),
      investments: {
        external: roundMoney(row.external),
        salary: roundMoney(row.salary),
        reinvestment: roundMoney(row.reinvestment),
        total: roundMoney(invested),
        reinvestmentPercent:
          invested > 0 ? (row.reinvestment / invested) * 100 : 0,
      },
    };
  }

  async assertPayable(
    client: MemberFinanceReader,
    workspaceId: string,
    memberId: string,
    primaryCurrency: string,
    amount: number,
  ) {
    const rows = await this.summaryRows(workspaceId, [memberId], client);
    const summary = this.presentSummary(
      memberId,
      primaryCurrency,
      rows.byMember.get(memberId),
    );
    if (amount - summary.commissionPayable > 0.001) {
      throw new BadRequestException('Amount exceeds unpaid sales commission');
    }
  }

  async summaries(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: membership.workspaceId },
      select: { primaryCurrency: true },
    });
    const memberIds =
      membership.role === WorkspaceRole.owner
        ? (
            await this.prisma.workspaceMember.findMany({
              where: { workspaceId: membership.workspaceId },
              select: { id: true },
            })
          ).map((row) => row.id)
        : [membership.id];
    if (memberIds.length === 0) return [];
    const rows = await this.summaryRows(membership.workspaceId, memberIds);
    return memberIds.map((id) =>
      this.presentSummary(id, workspace.primaryCurrency, rows.byMember.get(id)),
    );
  }

  async details(userId: string, memberId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    if (membership.role !== WorkspaceRole.owner && membership.id !== memberId) {
      throw new ForbiddenException(
        'You can only view your own finance history',
      );
    }
    const [member, workspace, rows] = await Promise.all([
      this.prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId: membership.workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: membership.workspaceId },
        select: { primaryCurrency: true },
      }),
      this.summaryRows(membership.workspaceId, [memberId]),
    ]);
    if (!member) throw new NotFoundException('Workspace member not found');
    const timeline = [
      ...rows.payments.map((payment) => ({
        id: `commission:${payment.id}`,
        type: 'COMMISSION_EARNED',
        date: payment.paidAt.toISOString(),
        amount: salesCommission(
          Number(payment.amountInPrimaryCurrency),
          Number(payment.sale.sellerCommissionRate),
        ),
        title: payment.sale.title || payment.sale.advertiserName,
      })),
      ...rows.settlements.map((settlement) => ({
        id: `settlement:${settlement.id}`,
        type:
          settlement.type === MemberCompensationSettlementType.PAYOUT
            ? 'SALARY_PAID'
            : 'SALARY_INVESTED',
        date: settlement.date.toISOString(),
        amount: Number(settlement.amountInPrimaryCurrency),
        title: settlement.notes,
      })),
      ...rows.investments
        .filter((investment) => investment.origin !== InvestmentOrigin.SALARY)
        .map((investment) => ({
          id: `investment:${investment.id}`,
          type: `${investment.origin}_${investment.movementType}`,
          date: investment.date.toISOString(),
          amount: this.signedInvestment(investment),
          title: investment.notes,
        })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return {
      member: {
        id: member.id,
        name: member.user.name,
        email: member.user.email,
      },
      ...this.presentSummary(
        memberId,
        workspace.primaryCurrency,
        rows.byMember.get(memberId),
      ),
      timeline,
    };
  }
}
