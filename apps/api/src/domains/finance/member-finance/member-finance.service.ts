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
  TransactionType,
  WorkspaceRole,
} from '@prisma/client';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import {
  DistributeReinvestmentDto,
  SettleCommissionDto,
  WithdrawReinvestmentDto,
} from './dto';
import {
  allocateProfitByCapital,
  reinvestableProfit,
  roundMoney,
  salesCommission,
} from './member-finance-calculations';
import { MemberFinanceReadService } from './member-finance-read.service';

@Injectable()
export class MemberFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly conversion: CurrencyConversionService,
    private readonly categories: FinanceCategoriesService,
    private readonly reads: MemberFinanceReadService,
  ) {}

  private async requireOwner(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    if (membership.role !== WorkspaceRole.owner) {
      throw new ForbiddenException(
        'Only workspace owners can manage member money',
      );
    }
    return membership;
  }

  private async member(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!member) throw new NotFoundException('Workspace member not found');
    return member;
  }

  private async lockMemberFinance(
    tx: Prisma.TransactionClient,
    workspaceId: string,
  ) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`member-finance:${workspaceId}`}, 0)
      )
    `;
  }

  async payCommission(
    userId: string,
    memberId: string,
    dto: SettleCommissionDto,
  ) {
    const owner = await this.requireOwner(userId);
    if (!dto.accountId) throw new BadRequestException('accountId is required');
    const [member, workspace, account] = await Promise.all([
      this.member(owner.workspaceId, memberId),
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: owner.workspaceId },
        select: { primaryCurrency: true },
      }),
      this.prisma.account.findFirst({
        where: {
          id: dto.accountId,
          workspaceId: owner.workspaceId,
          isActive: true,
        },
      }),
    ]);
    if (!account) throw new NotFoundException('Account not found');
    const rate =
      account.currency === workspace.primaryCurrency
        ? 1
        : await this.conversion.getRate(
            account.currency,
            workspace.primaryCurrency,
            owner.workspaceId,
            dto.date ? new Date(dto.date) : new Date(),
          );
    if (!rate)
      throw new BadRequestException(
        `No exchange rate from ${account.currency} to ${workspace.primaryCurrency}`,
      );
    await this.categories.ensureSystemCategories(owner.workspaceId);
    const category = await this.prisma.transactionCategory.findFirstOrThrow({
      where: {
        workspaceId: owner.workspaceId,
        type: TransactionType.expense,
        key: 'salary',
      },
    });
    const nativeAmount = roundMoney(dto.amount / rate);
    return this.prisma.$transaction(async (tx) => {
      await this.lockMemberFinance(tx, owner.workspaceId);
      await this.reads.assertPayable(
        tx,
        owner.workspaceId,
        memberId,
        workspace.primaryCurrency,
        dto.amount,
      );
      const transaction = await tx.transaction.create({
        data: {
          workspaceId: owner.workspaceId,
          accountId: account.id,
          type: TransactionType.expense,
          amount: nativeAmount,
          currency: account.currency,
          amountInPrimaryCurrency: dto.amount,
          exchangeRateToPrimary: rate,
          category: category.name,
          categoryId: category.id,
          memberId,
          assignedMemberId: memberId,
          description:
            dto.notes?.trim() || `Sales commission paid to ${member.user.name}`,
          date: dto.date ? new Date(dto.date) : new Date(),
          createdByUserId: userId,
        },
      });
      return tx.memberCompensationSettlement.create({
        data: {
          workspaceId: owner.workspaceId,
          workspaceMemberId: memberId,
          type: MemberCompensationSettlementType.PAYOUT,
          amountInPrimaryCurrency: dto.amount,
          transactionId: transaction.id,
          date: transaction.date,
          notes: dto.notes?.trim() || null,
          createdByUserId: userId,
        },
      });
    });
  }

  async investCommission(
    userId: string,
    memberId: string,
    dto: SettleCommissionDto,
  ) {
    const owner = await this.requireOwner(userId);
    const [member, workspace] = await Promise.all([
      this.member(owner.workspaceId, memberId),
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: owner.workspaceId },
        select: { primaryCurrency: true },
      }),
    ]);
    const date = dto.date ? new Date(dto.date) : new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockMemberFinance(tx, owner.workspaceId);
      await this.reads.assertPayable(
        tx,
        owner.workspaceId,
        memberId,
        workspace.primaryCurrency,
        dto.amount,
      );
      const investment = await tx.investment.create({
        data: {
          workspaceId: owner.workspaceId,
          workspaceMemberId: memberId,
          accountId: null,
          amount: dto.amount,
          currency: workspace.primaryCurrency,
          amountInPrimaryCurrency: dto.amount,
          exchangeRateToPrimary: 1,
          date,
          notes:
            dto.notes?.trim() ||
            `Sales commission invested by ${member.user.name}`,
          origin: InvestmentOrigin.SALARY,
          movementType: InvestmentMovementType.CONTRIBUTION,
          createdByUserId: userId,
          assignedMemberId: memberId,
        },
      });
      return tx.memberCompensationSettlement.create({
        data: {
          workspaceId: owner.workspaceId,
          workspaceMemberId: memberId,
          type: MemberCompensationSettlementType.INVESTMENT,
          amountInPrimaryCurrency: dto.amount,
          investmentId: investment.id,
          date,
          notes: dto.notes?.trim() || null,
          createdByUserId: userId,
        },
      });
    });
  }

  async distributeReinvestment(userId: string, dto: DistributeReinvestmentDto) {
    const owner = await this.requireOwner(userId);
    const from = new Date(`${dto.dateFrom}T00:00:00`);
    const to = new Date(`${dto.dateTo}T00:00:00`);
    to.setHours(23, 59, 59, 999);
    if (from > to)
      throw new BadRequestException('dateFrom must not be after dateTo');
    return this.prisma.$transaction(async (tx) => {
      await this.lockMemberFinance(tx, owner.workspaceId);
      const existing = await tx.reinvestmentDistribution.findFirst({
        where: {
          workspaceId: owner.workspaceId,
          periodStart: { lte: to },
          periodEnd: { gte: from },
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(
          'This period overlaps profit that was already distributed',
        );
      }

      const [workspace, transactions, payouts, commissionPayments, capital] =
        await Promise.all([
          tx.workspace.findUniqueOrThrow({
            where: { id: owner.workspaceId },
            select: { primaryCurrency: true },
          }),
          tx.transaction.findMany({
            where: {
              workspaceId: owner.workspaceId,
              deletedAt: null,
              date: { gte: from, lte: to },
            },
            select: {
              id: true,
              type: true,
              amountInPrimaryCurrency: true,
              categoryRef: { select: { key: true } },
              category: true,
            },
          }),
          tx.memberCompensationSettlement.findMany({
            where: {
              workspaceId: owner.workspaceId,
              type: MemberCompensationSettlementType.PAYOUT,
              date: { gte: from, lte: to },
            },
            select: { transactionId: true },
          }),
          tx.telegramAdSalePayment.findMany({
            where: {
              workspaceId: owner.workspaceId,
              status: TelegramAdSalePaymentStatus.ACTIVE,
              paidAt: { gte: from, lte: to },
              sale: { sellerCommissionEnabled: true },
            },
            select: {
              amountInPrimaryCurrency: true,
              sale: { select: { sellerCommissionRate: true } },
            },
          }),
          tx.investment.groupBy({
            by: ['workspaceMemberId', 'movementType'],
            where: { workspaceId: owner.workspaceId },
            _sum: { amountInPrimaryCurrency: true },
          }),
        ]);

      const payoutTransactionIds = new Set(
        payouts
          .map((row) => row.transactionId)
          .filter((id): id is string => Boolean(id)),
      );
      const accruedSalesCommission = commissionPayments.reduce(
        (sum, payment) =>
          sum +
          salesCommission(
            Number(payment.amountInPrimaryCurrency),
            Number(payment.sale.sellerCommissionRate),
          ),
        0,
      );
      const netProfit = reinvestableProfit({
        operatingTransactions: transactions.map((row) => ({
          ...row,
          categoryKey:
            row.categoryRef?.key ??
            row.category.trim().toLowerCase().replace(/\s+/g, '_'),
        })),
        commissionPayoutTransactionIds: payoutTransactionIds,
        accruedSalesCommission,
      });
      if (netProfit <= 0) {
        throw new BadRequestException(
          'Selected period has no profit after sales salary to reinvest',
        );
      }

      const capitalByMember = new Map<string, number>();
      for (const row of capital) {
        const direction =
          row.movementType === InvestmentMovementType.WITHDRAWAL ? -1 : 1;
        capitalByMember.set(
          row.workspaceMemberId,
          (capitalByMember.get(row.workspaceMemberId) ?? 0) +
            Number(row._sum.amountInPrimaryCurrency ?? 0) * direction,
        );
      }
      const allocations = allocateProfitByCapital(
        netProfit,
        [...capitalByMember].map(([memberId, amount]) => ({
          memberId,
          amount,
        })),
      );
      if (!allocations.length) {
        throw new BadRequestException(
          'Add investor capital before distributing profit',
        );
      }

      const distribution = await tx.reinvestmentDistribution.create({
        data: {
          workspaceId: owner.workspaceId,
          periodStart: from,
          periodEnd: to,
          profitInPrimaryCurrency: netProfit,
          createdByUserId: userId,
        },
      });
      const created: Array<{
        workspaceMemberId: string;
        amountInPrimaryCurrency: unknown;
      }> = [];
      for (const { memberId, amount } of allocations) {
        created.push(
          await tx.investment.create({
            data: {
              workspaceId: owner.workspaceId,
              workspaceMemberId: memberId,
              accountId: null,
              amount,
              currency: workspace.primaryCurrency,
              amountInPrimaryCurrency: amount,
              exchangeRateToPrimary: 1,
              date: to,
              notes: `Reinvested profit for ${dto.dateFrom} — ${dto.dateTo}`,
              origin: InvestmentOrigin.REINVESTMENT,
              movementType: InvestmentMovementType.CONTRIBUTION,
              reinvestmentDistributionId: distribution.id,
              createdByUserId: userId,
              assignedMemberId: memberId,
            },
          }),
        );
      }
      return {
        distributionId: distribution.id,
        amount: netProfit,
        currency: workspace.primaryCurrency,
        allocations: created.map((row) => ({
          memberId: row.workspaceMemberId,
          amount: Number(row.amountInPrimaryCurrency),
        })),
      };
    });
  }

  async withdrawReinvestment(
    userId: string,
    memberId: string,
    dto: WithdrawReinvestmentDto,
  ) {
    const owner = await this.requireOwner(userId);
    const [member, workspace, account] = await Promise.all([
      this.member(owner.workspaceId, memberId),
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: owner.workspaceId },
        select: { primaryCurrency: true },
      }),
      this.prisma.account.findFirst({
        where: {
          id: dto.accountId,
          workspaceId: owner.workspaceId,
          isActive: true,
        },
      }),
    ]);
    if (!account) throw new NotFoundException('Account not found');
    const rate =
      account.currency === workspace.primaryCurrency
        ? 1
        : await this.conversion.getRate(
            account.currency,
            workspace.primaryCurrency,
            owner.workspaceId,
            dto.date ? new Date(dto.date) : new Date(),
          );
    if (!rate)
      throw new BadRequestException(
        `No exchange rate from ${account.currency} to ${workspace.primaryCurrency}`,
      );
    const category = await this.prisma.transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId: owner.workspaceId,
          type: TransactionType.expense,
          key: 'investment_return',
        },
      },
      update: { isSystem: true, name: 'Investment Return' },
      create: {
        workspaceId: owner.workspaceId,
        type: TransactionType.expense,
        key: 'investment_return',
        isSystem: true,
        name: 'Investment Return',
      },
    });
    const date = dto.date ? new Date(dto.date) : new Date();
    const nativeAmount = roundMoney(dto.amount / rate);
    return this.prisma.$transaction(async (tx) => {
      await this.lockMemberFinance(tx, owner.workspaceId);
      const rows = await this.reads.summaryRows(
        owner.workspaceId,
        [memberId],
        tx,
      );
      const available = rows.byMember.get(memberId)?.reinvestment ?? 0;
      if (dto.amount - available > 0.001) {
        throw new BadRequestException('Amount exceeds available reinvestment');
      }
      const transaction = await tx.transaction.create({
        data: {
          workspaceId: owner.workspaceId,
          accountId: account.id,
          type: TransactionType.expense,
          amount: nativeAmount,
          currency: account.currency,
          amountInPrimaryCurrency: dto.amount,
          exchangeRateToPrimary: rate,
          category: category.name,
          categoryId: category.id,
          memberId,
          assignedMemberId: memberId,
          description:
            dto.notes?.trim() ||
            `Reinvestment withdrawn by ${member.user.name}`,
          date,
          createdByUserId: userId,
        },
      });
      return tx.investment.create({
        data: {
          workspaceId: owner.workspaceId,
          workspaceMemberId: memberId,
          accountId: account.id,
          transactionId: transaction.id,
          amount: nativeAmount,
          currency: account.currency,
          amountInPrimaryCurrency: dto.amount,
          exchangeRateToPrimary: rate,
          date,
          notes: dto.notes?.trim() || null,
          origin: InvestmentOrigin.REINVESTMENT,
          movementType: InvestmentMovementType.WITHDRAWAL,
          createdByUserId: userId,
          assignedMemberId: memberId,
        },
      });
    });
  }
}
