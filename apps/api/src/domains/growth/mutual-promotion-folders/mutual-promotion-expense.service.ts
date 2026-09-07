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
import { MutualPromotionReadService } from './mutual-promotion-read.service';

@Injectable()
export class MutualPromotionExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly financeCategories: FinanceCategoriesService,
    private readonly read: MutualPromotionReadService,
  ) {}

  async upsert(
    userId: string,
    folderId: string,
    participantId: string,
    dto: MutualPromotionExpenseDto,
  ) {
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

  private async rate(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    from: string,
    to: string,
  ) {
    if (from === to) return 1;
    const direct = await tx.exchangeRate.findFirst({
      where: { workspaceId, baseCurrency: from, targetCurrency: to },
      orderBy: { date: 'desc' },
    });
    if (direct) return Number(direct.rate);
    const inverse = await tx.exchangeRate.findFirst({
      where: { workspaceId, baseCurrency: to, targetCurrency: from },
      orderBy: { date: 'desc' },
    });
    if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate);
    throw new BadRequestException(`No exchange rate from ${from} to ${to}`);
  }
}
