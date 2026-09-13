import { Prisma } from '@prisma/client';
import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import type { PrismaService } from '../../../../prisma/prisma.service';

const iso = (value: Date | null) => value?.toISOString() ?? null;
const decimal = (value: Prisma.Decimal) => value.toString();

/** A bounded, user-triggered snapshot that is directly accepted by import v1. */
async function financeDataSnapshot(
  prisma: Prisma.TransactionClient,
  profileId: string,
): Promise<ConsumerFinanceImportDocumentV1> {
  const [
    profile,
    accounts,
    categories,
    transactions,
    transfers,
    limits,
    reminders,
    savingsGoals,
    savingsMovements,
    investments,
    investmentCashFlows,
    investmentValuations,
    debts,
    regularPayments,
  ] = await Promise.all([
    prisma.financeProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: {
        defaultCurrency: true,
        timezone: true,
        locale: true,
        displayName: true,
      },
    }),
    prisma.financeAccount.findMany({ where: { profileId } }),
    prisma.financeCategory.findMany({ where: { profileId } }),
    prisma.financeTransaction.findMany({
      where: {
        profileId,
        deletedAt: null,
        purpose: { notIn: ['INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN'] },
      },
      include: { items: true },
    }),
    prisma.financeTransfer.findMany({
      where: { profileId, deletedAt: null },
    }),
    prisma.financeSpendingLimit.findMany({ where: { profileId } }),
    prisma.financeReminder.findMany({ where: { profileId } }),
    prisma.financeSavingsGoal.findMany({ where: { profileId } }),
    prisma.financeSavingsMovement.findMany({ where: { profileId } }),
    prisma.financeInvestment.findMany({ where: { profileId } }),
    prisma.financeInvestmentCashFlow.findMany({
      where: { profileId },
      include: { transaction: { select: { amount: true } } },
    }),
    prisma.financeInvestmentValuation.findMany({ where: { profileId } }),
    prisma.financeDebt.findMany({ where: { profileId } }),
    prisma.financeRecurringPayment.findMany({ where: { profileId } }),
  ]);

  return {
    format: 'telegram-system.consumer-finance',
    version: 1,
    mode: 'ADD',
    settings: {
      defaultCurrency: profile.defaultCurrency,
      timezone: profile.timezone,
      ...(profile.locale === 'uk' ||
      profile.locale === 'ru' ||
      profile.locale === 'en'
        ? { locale: profile.locale }
        : {}),
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
    },
    data: {
      accounts: accounts.map((row) => ({
        ref: row.id,
        name: row.name,
        emoji: row.emoji,
        type: row.type,
        currency: row.currency,
        openingBalance: decimal(row.openingBalance),
        archivedAt: iso(row.archivedAt),
      })),
      categories: categories.map((row) => ({
        ref: row.id,
        parentRef: row.parentId,
        name: row.name,
        emoji: row.emoji,
        type: row.type,
        key: row.key,
        archivedAt: iso(row.archivedAt),
      })),
      transactions: transactions.map((row) => ({
        ref: row.id,
        accountRef: row.accountId,
        categoryRef: row.categoryId,
        type: row.type,
        amount: decimal(row.amount),
        economicAmount: decimal(row.economicAmount ?? row.amount),
        purpose:
          row.purpose === 'INVESTMENT_CONTRIBUTION' ||
          row.purpose === 'INVESTMENT_RETURN'
            ? 'ORDINARY'
            : row.purpose,
        necessity: row.necessity ?? 'UNSPECIFIED',
        occurredAt: row.occurredAt.toISOString(),
        description: row.description,
        merchantDisplay: row.merchantDisplay,
        items: row.items.map((item) => ({
          displayName: item.displayName,
          quantity: item.quantity?.toString() ?? null,
          unitPrice: item.unitPrice?.toString() ?? null,
          totalAmount: decimal(item.totalAmount),
          categoryRef: item.categoryId,
          metadata: (item.metadata as Record<string, unknown> | null) ?? null,
        })),
      })),
      transfers: transfers.map((row) => ({
        ref: row.id,
        fromAccountRef: row.fromAccountId,
        toAccountRef: row.toAccountId,
        fromAmount: decimal(row.fromAmount),
        toAmount: decimal(row.toAmount),
        occurredAt: row.occurredAt.toISOString(),
        description: row.description,
      })),
      limits: limits.map((row) => ({
        ref: row.id,
        categoryRef: row.categoryId,
        amount: decimal(row.amount),
        currency: row.currency,
      })),
      reminders: reminders.map((row) => ({
        ref: row.id,
        name: row.name,
        amount: decimal(row.amount),
        currency: row.currency,
        dayOfMonth: row.dayOfMonth,
        reminderOffsetMinutes: row.reminderOffsetMinutes,
        nextOccurrenceAt: row.nextOccurrenceAt.toISOString(),
        enabled: row.enabled,
      })),
      debts: debts.map((row) => ({
        ref: row.id,
        accountRef: row.accountId,
        settlementTransactionRef: row.settlementTransactionId,
        direction: row.direction,
        status: row.status,
        name: row.name,
        amount: decimal(row.amount),
        dueAt: row.dueAt.toISOString(),
        scheduleTimezone: row.scheduleTimezone,
        note: row.note,
        settledAt: iso(row.settledAt),
      })),
      regularPayments: regularPayments.map((row) => ({
        ref: row.id,
        accountRef: row.accountId,
        categoryRef: row.categoryId,
        name: row.name,
        amount: decimal(row.amount),
        recurrence: row.recurrence,
        nextOccurrenceAt: row.nextOccurrenceAt.toISOString(),
        scheduleTimezone: row.scheduleTimezone,
        note: row.note,
        status: row.status,
        necessity: row.necessity,
      })),
      savingsGoals: savingsGoals.map((row) => ({
        ref: row.id,
        name: row.name,
        targetAmount: decimal(row.targetAmount),
        initialAmount: decimal(row.legacyUnlinkedAmount),
        currency: row.currency,
        targetDate: iso(row.targetDate),
        note: row.note,
        status: row.status,
      })),
      savingsMovements: savingsMovements.map((row) => ({
        ref: row.id,
        accountRef: row.accountId,
        fromGoalRef: row.fromGoalId,
        toGoalRef: row.toGoalId,
        linkedTransferRef: row.linkedTransferId,
        kind: row.kind,
        amount: decimal(row.amount),
        occurredAt: row.occurredAt.toISOString(),
        note: row.note,
      })),
      investments: investments.map((row) => ({
        ref: row.id,
        name: row.name,
        description: row.description,
        type: row.type,
        currency: row.currency,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        closedAt: iso(row.closedAt),
      })),
      investmentCashFlows: investmentCashFlows.map((row) => ({
        ref: row.id,
        investmentRef: row.investmentId,
        accountRef: row.accountId,
        kind: row.kind,
        amount: decimal(row.transaction.amount),
        occurredAt: row.occurredAt.toISOString(),
        note: row.note,
      })),
      investmentValuations: investmentValuations.map((row) => ({
        ref: row.id,
        investmentRef: row.investmentId,
        value: decimal(row.value),
        valuedAt: row.valuedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        correctsRef: row.correctsValuationId,
        note: row.note,
      })),
    },
  };
}

export function exportFinanceData(
  prisma: PrismaService,
  profileId: string,
): Promise<ConsumerFinanceImportDocumentV1> {
  return prisma.$transaction((tx) => financeDataSnapshot(tx, profileId), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 5_000,
    timeout: 30_000,
  });
}
