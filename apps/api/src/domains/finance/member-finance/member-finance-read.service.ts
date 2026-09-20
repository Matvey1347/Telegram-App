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
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { valueDashboardTransactions } from '../../operations/dashboard/dashboard-transaction-valuation';
import { roundMoney, salesCommission } from './member-finance-calculations';
import { allocateProfitByCapital } from './member-finance-calculations';

export type MemberFinanceReader = Pick<
  Prisma.TransactionClient,
  | 'telegramAdSalePayment'
  | 'memberCompensationSettlement'
  | 'investment'
  | 'transaction'
  | 'workspaceMember'
  | 'workspace'
>;

type MemberTotals = {
  commissionEarned: number;
  commissionSettled: number;
  external: number;
  salary: number;
  investorEarnings: number;
};

@Injectable()
export class MemberFinanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly conversion: CurrencyConversionService,
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
    const [
      payments,
      settlements,
      investments,
      transactions,
      members,
      workspace,
    ] = await Promise.all([
      client.telegramAdSalePayment.findMany({
        where: {
          workspaceId,
          status: TelegramAdSalePaymentStatus.ACTIVE,
          sale: {
            sellerMemberId: undefined,
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
        where: { workspaceId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      client.investment.findMany({
        where: { workspaceId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      client.transaction.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          id: true,
          type: true,
          date: true,
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          category: true,
          categoryRef: { select: { key: true } },
          telegramAdSalePayment: { select: { id: true } },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
      client.workspaceMember.findMany({
        where: { workspaceId, isHidden: false },
        select: { id: true },
      }),
      client.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { primaryCurrency: true },
      }),
    ]);
    const valuedTransactions = await valueDashboardTransactions({
      transactions,
      primaryCurrency: workspace.primaryCurrency,
      workspaceId,
      conversionService: this.conversion,
    });

    const byMember = new Map<string, MemberTotals>();
    const get = (id: string) => {
      const current = byMember.get(id) ?? {
        commissionEarned: 0,
        commissionSettled: 0,
        external: 0,
        salary: 0,
        investorEarnings: 0,
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
      else if (investment.origin === InvestmentOrigin.EXTERNAL)
        row.external += value;
    }
    const visibleMemberIds = new Set(members.map((member) => member.id));
    const capitalByMember = new Map<string, number>();
    for (const investment of investments) {
      if (
        investment.origin === InvestmentOrigin.REINVESTMENT ||
        !visibleMemberIds.has(investment.workspaceMemberId)
      ) {
        continue;
      }
      const change = this.signedInvestment(investment);
      capitalByMember.set(
        investment.workspaceMemberId,
        (capitalByMember.get(investment.workspaceMemberId) ?? 0) + change,
      );
    }
    const commissionByPayment = new Map(
      payments.map((payment) => [
        payment.id,
        salesCommission(
          Number(payment.amountInPrimaryCurrency),
          Number(payment.sale.sellerCommissionRate),
        ),
      ]),
    );
    // Investor profit is a single current balance: all earned revenue less
    // sales commission is divided by today's visible investor capital. Do not
    // allocate historical income against a past capital snapshot.
    const totalProfit = valuedTransactions.reduce((sum, transaction) => {
      const key =
        transaction.categoryRef?.key ??
        transaction.category.trim().toLowerCase().replace(/\s+/g, '_');
      if (
        transaction.type !== 'income' ||
        [
          'investment',
          'investment_return',
          'balance_adjustment',
          'fixing_balance',
        ].includes(key)
      )
        return sum;
      let revenue = Number(transaction.amountInPrimaryCurrency ?? 0);
      const paymentId = transaction.telegramAdSalePayment?.id;
      if (paymentId) revenue -= commissionByPayment.get(paymentId) ?? 0;
      return sum + revenue;
    }, 0);
    const allocations = allocateProfitByCapital(
      totalProfit,
      [...capitalByMember].map(([memberId, amount]) => ({
        memberId,
        amount,
      })),
    );
    for (const allocation of allocations) {
      get(allocation.memberId).investorEarnings += allocation.amount;
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
      investorEarnings: 0,
    };
    const principal = row.external + row.salary;
    const invested = principal + row.investorEarnings;
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
        investorEarnings: roundMoney(row.investorEarnings),
        total: roundMoney(invested),
        principal: roundMoney(principal),
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
        include: {
          user: { select: { id: true, name: true, email: true } },
          avatarIcon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
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
        avatarPresentation: iconToResolvedEmoji(member.avatarIcon),
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
