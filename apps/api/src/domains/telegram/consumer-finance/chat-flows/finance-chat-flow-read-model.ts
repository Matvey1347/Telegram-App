import { PrismaService } from '../../../../prisma/prisma.service';
import {
  financeAccountEmoji,
  financeCategoryEmoji,
} from '../catalog/finance-entity-emoji';

type Payload = Record<string, string | null | undefined>;
type Result = { step: string; payload: Payload };

export class FinanceChatFlowReadModel {
  constructor(private readonly prisma: PrismaService) {}

  async choices(profileId: string, result: Result, page = 0) {
    const skip = Math.max(0, page) * 10;
    if (
      ['TRANSACTION_ACCOUNT', 'TRANSFER_FROM', 'TRANSFER_TO'].includes(
        result.step,
      )
    )
      return (
        await this.prisma.financeAccount.findMany({
          where: {
            profileId,
            archivedAt: null,
            ...(result.step === 'TRANSFER_TO' && result.payload.fromAccountId
              ? { id: { not: result.payload.fromAccountId } }
              : {}),
          },
          select: {
            id: true,
            name: true,
            currency: true,
            type: true,
            emoji: true,
          },
          orderBy: { createdAt: 'asc' },
          skip,
          take: 11,
        })
      ).map((account) => ({
        id: account.id,
        label: `${account.name} · ${account.currency}`,
        emoji: account.emoji || financeAccountEmoji(account.type),
      }));
    if (
      result.step === 'TRANSACTION_CATEGORY' ||
      result.step === 'CATEGORY_PARENT'
    )
      return (
        await this.prisma.financeCategory.findMany({
          where: {
            profileId,
            archivedAt: null,
            type: result.payload.type as 'INCOME' | 'EXPENSE',
            ...(result.step === 'CATEGORY_PARENT' && result.payload.entityId
              ? { id: { not: result.payload.entityId } }
              : {}),
          },
          select: { id: true, name: true, key: true, emoji: true },
          orderBy: { name: 'asc' },
          skip,
          take: 11,
        })
      ).map((category) => ({
        id: category.id,
        label: category.name,
        key: category.key,
        emoji:
          category.emoji || financeCategoryEmoji(category.name, category.key),
      }));
    return [];
  }

  activeAccounts(profileId: string) {
    return this.prisma.financeAccount.findMany({
      where: { profileId, archivedAt: null },
      select: { id: true, name: true, currency: true, type: true, emoji: true },
      orderBy: { createdAt: 'asc' },
      take: 11,
    });
  }

  async reviewLabels(profileId: string, payload: Payload) {
    const ids = [
      payload.accountId,
      payload.fromAccountId,
      payload.toAccountId,
    ].filter((id): id is string => Boolean(id));
    const [accounts, category] = await Promise.all([
      ids.length
        ? this.prisma.financeAccount.findMany({
            where: { profileId, id: { in: ids } },
            select: { id: true, name: true, currency: true, archivedAt: true },
          })
        : [],
      payload.categoryId
        ? this.prisma.financeCategory.findFirst({
            where: { profileId, id: payload.categoryId },
            select: { id: true, name: true, key: true, archivedAt: true },
          })
        : null,
    ]);
    return { accounts, category };
  }

  async selection(
    profileId: string,
    step: string,
    id: string,
    payload: Payload,
  ): Promise<Payload | null> {
    if (
      ['TRANSACTION_ACCOUNT', 'TRANSFER_FROM', 'TRANSFER_TO'].includes(step)
    ) {
      if (step === 'TRANSFER_TO' && id === payload.fromAccountId) return null;
      const account = await this.prisma.financeAccount.findFirst({
        where: { id, profileId, archivedAt: null },
        select: {
          id: true,
          name: true,
          currency: true,
          type: true,
          emoji: true,
        },
      });
      if (!account) return null;
      return step === 'TRANSACTION_ACCOUNT'
        ? {
            accountName: account.name,
            accountCurrency: account.currency,
            accountEmoji: account.emoji || financeAccountEmoji(account.type),
          }
        : {};
    }
    if (step === 'TRANSACTION_CATEGORY' || step === 'CATEGORY_PARENT') {
      const category = await this.prisma.financeCategory.findFirst({
        where: {
          id,
          profileId,
          archivedAt: null,
          type: payload.type as 'INCOME' | 'EXPENSE',
          ...(step === 'CATEGORY_PARENT' && payload.entityId
            ? { id: { not: payload.entityId } }
            : {}),
        },
        select: { id: true, name: true, key: true, emoji: true },
      });
      if (!category) return null;
      return step === 'TRANSACTION_CATEGORY'
        ? {
            categoryName: category.name,
            categoryKey: category.key,
            categoryEmoji:
              category.emoji ||
              financeCategoryEmoji(category.name, category.key),
          }
        : {};
    }
    return {};
  }
}
