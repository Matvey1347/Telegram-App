import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceCoreService } from '../catalog/finance-core.service';
import { FinanceLedgerService } from '../ledger/finance-ledger.service';
import { FinanceTransferService } from '../transfers/finance-transfer.service';
import type {
  FinanceFlowKind,
  FinanceFlowPayload,
} from './finance-chat-flow.types';

export class FinanceChatFlowWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: FinanceCoreService,
    private readonly ledger?: FinanceLedgerService,
    private readonly transfers?: FinanceTransferService,
  ) {}

  async write(
    profileId: string,
    flow: FinanceFlowKind,
    p: FinanceFlowPayload,
    recovering: boolean,
  ) {
    const resultId = p.resultId || randomUUID();
    if (flow === 'ACCOUNT_CREATE') {
      const existing = recovering
        ? await this.prisma.financeAccount.findFirst({
            where: { id: resultId, profileId },
            select: { id: true },
          })
        : null;
      return (
        existing?.id ||
        (
          await this.core.createAccount(
            profileId,
            {
              name: p.name!,
              type: p.type as 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER',
              emoji: p.emoji || null,
              currency: p.currency || undefined,
              openingBalance: p.amount || '0',
            },
            resultId,
          )
        ).id
      );
    }
    if (flow === 'ACCOUNT_EDIT')
      return (
        await this.core.updateAccount(profileId, p.entityId!, {
          ...(p.name ? { name: p.name } : {}),
          ...(p.type
            ? { type: p.type as 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER' }
            : {}),
          emoji: p.emoji || null,
        })
      ).id;
    if (flow === 'CATEGORY_CREATE') {
      const existing = recovering
        ? await this.prisma.financeCategory.findFirst({
            where: { id: resultId, profileId },
            select: { id: true },
          })
        : null;
      return (
        existing?.id ||
        (
          await this.core.createCategory(
            profileId,
            {
              name: p.name!,
              type: p.type as 'INCOME' | 'EXPENSE',
              emoji: p.emoji || null,
              parentId: p.parentId || undefined,
            },
            resultId,
          )
        ).id
      );
    }
    if (flow === 'CATEGORY_EDIT')
      return (
        await this.core.updateCategory(profileId, p.entityId!, {
          name: p.name!,
          type: p.type as 'INCOME' | 'EXPENSE',
          emoji: p.emoji || null,
          parentId: p.parentId || null,
        })
      ).id;
    if (flow === 'CATEGORY_ARCHIVE') {
      const existing = recovering
        ? await this.prisma.financeCategory.findFirst({
            where: { id: p.entityId!, profileId },
            select: { id: true, archivedAt: true },
          })
        : null;
      return existing?.archivedAt
        ? existing.id
        : (await this.core.archiveCategory(profileId, p.entityId!)).id;
    }
    if (flow === 'TRANSFER_CREATE') {
      const existing = recovering
        ? await this.prisma.financeTransfer.findFirst({
            where: { id: resultId, profileId },
            select: { id: true },
          })
        : null;
      return (
        existing?.id ||
        (
          await this.requireTransfers().create(
            profileId,
            {
              fromAccountId: p.fromAccountId!,
              toAccountId: p.toAccountId!,
              amount: p.amount!,
              occurredAt: p.occurredAt!,
              description: p.description || undefined,
            },
            resultId,
          )
        ).id
      );
    }
    if (flow === 'SETTINGS_LANGUAGE') {
      const profile = await this.core.profile(profileId);
      if (!profile) throw new Error('Finance profile not found');
      await this.core.updateSettings(profileId, {
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        locale: p.locale as 'uk' | 'ru' | 'en',
      });
      return profileId;
    }
    const existing = recovering
      ? await this.prisma.financeTransaction.findFirst({
          where: { id: resultId, profileId },
          select: { id: true },
        })
      : null;
    if (existing) return existing.id;
    const ledger = this.requireLedger();
    return (
      await ledger.createTransaction(
        await ledger.profileContext(profileId),
        {
          type: p.type as 'INCOME' | 'EXPENSE',
          accountId: p.accountId!,
          categoryId: p.categoryId || undefined,
          amount: p.amount!,
          description: p.description || undefined,
          occurredAt: p.occurredAt!,
        },
        'CHAT',
        resultId,
      )
    ).id;
  }

  private requireLedger() {
    if (!this.ledger) throw new Error('FinanceLedgerService is required');
    return this.ledger;
  }

  private requireTransfers() {
    if (!this.transfers) throw new Error('FinanceTransferService is required');
    return this.transfers;
  }
}
