import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MutualPromotionFolder,
  MutualPromotionFolderParticipant,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { FinanceCategoriesService } from '../../finance/finance-categories/finance-categories.service';
import type { MutualPromotionExpenseDto } from './dto';
import type {
  MutualPromotionExpenseAllocationDto,
  MutualPromotionParticipantDto,
} from './dto';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { financeAuthorizationTestFallback } from '../../finance/finance-authorization-test-fallback';

type ExpenseParticipant = Pick<
  MutualPromotionFolderParticipant,
  'id' | 'telegramChannelId' | 'role'
> & { expense?: MutualPromotionExpenseDto | null };

type PreparedExpense = {
  participant: ExpenseParticipant;
  accountId: string;
  amount: number | Prisma.Decimal;
};

@Injectable()
export class MutualPromotionExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly financeCategories: FinanceCategoriesService,
    private readonly read: MutualPromotionReadService,
    private readonly authorization: WorkspaceAuthorizationService = financeAuthorizationTestFallback(
      workspaceService,
    ),
  ) {}

  async upsert(
    userId: string,
    folderId: string,
    participantId: string,
    dto: MutualPromotionExpenseDto,
  ) {
    await this.authorization.require(userId, 'finance.create');
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const participant =
      await this.prisma.mutualPromotionFolderParticipant.findFirst({
        where: { id: participantId, folderId, workspaceId },
        include: { folder: true },
      });
    if (!participant)
      throw new NotFoundException('Mutual-promotion participant not found');
    if (participant.role !== 'PAID') {
      throw new BadRequestException(
        'Expenses are allowed only for paid participants',
      );
    }
    await this.prisma.$transaction((tx) => this.sync(tx, participant, dto));
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  async createForFolder(
    tx: Prisma.TransactionClient,
    folder: {
      id: string;
      workspaceId: string;
      title: string;
      startsAt: Date;
      assignedMemberId: string | null;
      captureInviteBaseline?: boolean;
    },
    participants: MutualPromotionParticipantDto[],
    expenseAllocation?: MutualPromotionExpenseAllocationDto | null,
  ) {
    const created =
      await tx.mutualPromotionFolderParticipant.createManyAndReturn({
        data: participants.map((input) => ({
          workspaceId: folder.workspaceId,
          folderId: folder.id,
          telegramChannelId: input.telegramChannelId,
          inviteLinkId: input.inviteLinkId,
          role: input.role,
          inviteLinkMode: 'REUSABLE',
        })),
        select: { id: true, telegramChannelId: true, role: true },
      });
    const createdByChannelId = new Map(
      created.map((participant) => [
        participant.telegramChannelId,
        participant,
      ]),
    );
    if (folder.captureInviteBaseline) {
      const links = await tx.telegramInviteLink.findMany({
        where: {
          workspaceId: folder.workspaceId,
          id: {
            in: participants.map((participant) => participant.inviteLinkId),
          },
        },
        select: { id: true, joinedCount: true, requestedCount: true },
      });
      const counters = new Map(links.map((link) => [link.id, link]));
      await Promise.all(
        participants.map((participant) => {
          const link = counters.get(participant.inviteLinkId);
          if (!link) throw new NotFoundException('Invite link not found');
          return tx.mutualPromotionFolderParticipant.update({
            where: {
              id: createdByChannelId.get(participant.telegramChannelId)!.id,
            },
            data: {
              inviteJoinedAtStart: link.joinedCount,
              inviteRequestedAtStart: link.requestedCount,
              baselineCapturedAt: new Date(),
            },
          });
        }),
      );
    }
    await this.createMany(tx, {
      workspaceId: folder.workspaceId,
      folderId: folder.id,
      folderTitle: folder.title,
      startsAt: folder.startsAt,
      assignedMemberId: folder.assignedMemberId,
      participants: participants.map((input) => ({
        ...createdByChannelId.get(input.telegramChannelId)!,
        expense: input.expense,
      })),
      expenseAllocation,
    });
  }

  async sync(
    tx: Prisma.TransactionClient,
    participant: MutualPromotionFolderParticipant & {
      folder?: MutualPromotionFolder;
    },
    dto: MutualPromotionExpenseDto,
  ) {
    const [workspace, account] = await Promise.all([
      tx.workspace.findUnique({
        where: { id: participant.workspaceId },
        select: { primaryCurrency: true },
      }),
      tx.account.findFirst({
        where: {
          id: dto.accountId,
          workspaceId: participant.workspaceId,
          deletedAt: null,
        },
      }),
    ]);
    if (!workspace || !account)
      throw new NotFoundException('Expense account not found');
    await this.financeCategories.ensureSystemCategories(
      participant.workspaceId,
      tx as never,
    );
    const category = await tx.transactionCategory.findFirst({
      where: {
        workspaceId: participant.workspaceId,
        type: 'expense',
        key: 'advertising',
      },
    });
    if (!category)
      throw new NotFoundException('Advertising transaction category not found');
    const rate = await this.rate(
      tx,
      participant.workspaceId,
      account.currency,
      workspace.primaryCurrency,
    );
    const folder =
      participant.folder ??
      (await tx.mutualPromotionFolder.findUnique({
        where: { id: participant.folderId },
      }));
    const payload = {
      workspaceId: participant.workspaceId,
      accountId: account.id,
      telegramChannelId: participant.telegramChannelId,
      type: 'expense' as const,
      amount: dto.amount,
      currency: account.currency,
      amountInPrimaryCurrency: dto.amount * rate,
      exchangeRateToPrimary: rate,
      category: category.name,
      categoryId: category.id,
      assignedMemberId: folder?.assignedMemberId ?? null,
      date: folder?.startsAt ?? new Date(),
      description: `Mutual promotion: ${folder?.title ?? participant.folderId}`,
      mutualPromotionParticipantId: participant.id,
    };
    await tx.transaction.upsert({
      where: { mutualPromotionParticipantId: participant.id },
      create: payload,
      update: payload,
    });
  }

  async createMany(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      folderId: string;
      folderTitle: string;
      startsAt: Date;
      assignedMemberId: string | null;
      participants: ExpenseParticipant[];
      expenseAllocation?: MutualPromotionExpenseAllocationDto | null;
    },
  ) {
    const expenseInputs = this.expenseInputs(
      input.participants,
      input.expenseAllocation,
    );
    if (!expenseInputs.length) return;

    const accountIds = [...new Set(expenseInputs.map((row) => row.accountId))];
    const [workspace, accounts] = await Promise.all([
      tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { primaryCurrency: true },
      }),
      tx.account.findMany({
        where: {
          id: { in: accountIds },
          workspaceId: input.workspaceId,
          deletedAt: null,
        },
        select: { id: true, currency: true },
      }),
    ]);
    if (!workspace || accounts.length !== accountIds.length) {
      throw new NotFoundException('Expense account not found');
    }

    await this.financeCategories.ensureSystemCategories(
      input.workspaceId,
      tx as never,
    );
    const category = await tx.transactionCategory.findFirst({
      where: {
        workspaceId: input.workspaceId,
        type: 'expense',
        key: 'advertising',
      },
      select: { id: true, name: true },
    });
    if (!category) {
      throw new NotFoundException('Advertising transaction category not found');
    }

    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const foreignCurrencies = [
      ...new Set(
        accounts
          .map((account) => account.currency)
          .filter((currency) => currency !== workspace.primaryCurrency),
      ),
    ];
    const rates = foreignCurrencies.length
      ? await tx.exchangeRate.findMany({
          where: {
            OR: foreignCurrencies.flatMap((currency) => [
              {
                baseCurrency: currency,
                targetCurrency: workspace.primaryCurrency,
              },
              {
                baseCurrency: workspace.primaryCurrency,
                targetCurrency: currency,
              },
            ]),
          },
          orderBy: { date: 'desc' },
          select: { baseCurrency: true, targetCurrency: true, rate: true },
        })
      : [];
    const ratesByPair = new Map<string, Prisma.Decimal>();
    for (const rate of rates) {
      const key = `${rate.baseCurrency}:${rate.targetCurrency}`;
      if (!ratesByPair.has(key)) ratesByPair.set(key, rate.rate);
    }

    const data: Prisma.TransactionCreateManyInput[] = expenseInputs.map(
      ({ participant, accountId, amount }) => {
        const account = accountsById.get(accountId)!;
        const rate = this.resolveRate(
          account.currency,
          workspace.primaryCurrency,
          ratesByPair,
        );
        const decimalAmount = new Prisma.Decimal(amount);
        return {
          workspaceId: input.workspaceId,
          accountId,
          telegramChannelId: participant.telegramChannelId,
          type: 'expense' as const,
          amount: decimalAmount,
          currency: account.currency,
          amountInPrimaryCurrency: decimalAmount.mul(rate),
          exchangeRateToPrimary: rate,
          category: category.name,
          categoryId: category.id,
          assignedMemberId: input.assignedMemberId,
          date: input.startsAt,
          description: `Mutual promotion: ${input.folderTitle}`,
          mutualPromotionParticipantId: participant.id,
        };
      },
    );
    await tx.transaction.createMany({ data });
  }

  private expenseInputs(
    participants: ExpenseParticipant[],
    allocation?: MutualPromotionExpenseAllocationDto | null,
  ): PreparedExpense[] {
    if (!allocation) {
      return participants.flatMap((participant) =>
        participant.expense
          ? [
              {
                participant,
                accountId: participant.expense.accountId,
                amount: participant.expense.amount,
              },
            ]
          : [],
      );
    }
    if (
      participants.some(
        (participant) => participant.role !== 'PAID' || participant.expense,
      )
    ) {
      throw new BadRequestException(
        'Equal expense allocation requires only paid participants without individual expenses',
      );
    }
    const totalCents = Math.round(allocation.totalAmount * 100);
    if (
      !Number.isFinite(allocation.totalAmount) ||
      allocation.totalAmount < 0 ||
      !Number.isSafeInteger(totalCents) ||
      Math.abs(totalCents / 100 - allocation.totalAmount) > 1e-9
    ) {
      throw new BadRequestException(
        'Equal expense allocation total must be a non-negative amount with at most two decimal places',
      );
    }
    if (!participants.length) {
      throw new BadRequestException(
        'Equal expense allocation requires at least one paid participant',
      );
    }
    const baseCents = Math.floor(totalCents / participants.length);
    const remainder = totalCents % participants.length;
    return participants.map((participant, index) => ({
      participant,
      accountId: allocation.accountId,
      amount: new Prisma.Decimal(baseCents + (index < remainder ? 1 : 0)).div(
        100,
      ),
    }));
  }

  private resolveRate(
    from: string,
    to: string,
    rates: Map<string, Prisma.Decimal>,
  ) {
    if (from === to) return new Prisma.Decimal(1);
    const direct = rates.get(`${from}:${to}`);
    if (direct) return direct;
    const inverse = rates.get(`${to}:${from}`);
    if (inverse && !inverse.isZero()) return new Prisma.Decimal(1).div(inverse);
    throw new BadRequestException(`No exchange rate from ${from} to ${to}`);
  }

  private async rate(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    from: string,
    to: string,
  ) {
    if (from === to) return 1;
    const direct = await tx.exchangeRate.findFirst({
      where: { baseCurrency: from, targetCurrency: to },
      orderBy: { date: 'desc' },
    });
    if (direct) return Number(direct.rate);
    const inverse = await tx.exchangeRate.findFirst({
      where: { baseCurrency: to, targetCurrency: from },
      orderBy: { date: 'desc' },
    });
    if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate);
    throw new BadRequestException(`No exchange rate from ${from} to ${to}`);
  }
}
