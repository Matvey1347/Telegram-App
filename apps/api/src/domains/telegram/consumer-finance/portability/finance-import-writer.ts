import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type {
  ConsumerFinanceImportDocumentV1,
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from '@telegram-system/shared';
import type { TelegramBotDeliveryWriterPort } from '../../telegram-bots/core/telegram-bot-delivery-writer';
import type { FinanceObligationPresentationPort } from '../obligations/finance-obligation-presentation.port';
import type { FinanceImportRates } from './finance-import-rates';
import { writeFinanceAssetImport } from './finance-import-asset-writer';
import { writeFinanceObligationImport } from './finance-import-obligation-writer';
import { clearFinanceDataForReplacement } from './finance-import-replace';

type Progress = (
  item: ConsumerFinanceImportProgress,
  current: number,
  total: number,
) => void;
type Tx = Prisma.TransactionClient;
const TOTAL_STEPS = 15;

function idMap(rows: ReadonlyArray<{ ref: string }>) {
  return new Map<string, string>(rows.map((row) => [row.ref, randomUUID()]));
}

function decimal(value: string | undefined, fallback = '0') {
  return new Prisma.Decimal(value ?? fallback);
}

function optionalDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function stopIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Import cancelled');
  error.name = 'AbortError';
  throw error;
}

function report(
  onProgress: Progress,
  section: ConsumerFinanceImportProgress['section'],
  processed: number,
  current: number,
) {
  onProgress(
    { phase: 'IMPORTING', section, processed, total: processed },
    current,
    TOTAL_STEPS,
  );
}

export async function writeFinanceImport(input: {
  tx: Tx;
  profileId: string;
  document: ConsumerFinanceImportDocumentV1;
  rates: FinanceImportRates;
  fingerprint: string;
  onProgress: Progress;
  signal: AbortSignal;
  delivery: TelegramBotDeliveryWriterPort;
  presentation: FinanceObligationPresentationPort;
}): Promise<{
  result: ConsumerFinanceImportResult;
  scheduledAt: Date[];
}> {
  const {
    tx,
    profileId,
    document,
    rates,
    fingerprint,
    onProgress,
    signal,
    delivery,
    presentation,
  } = input;
  const data = document.data;
  const accounts = data.accounts ?? [];
  const categories = data.categories ?? [];
  const transactions = data.transactions ?? [];
  const transfers = data.transfers ?? [];
  const limits = data.limits ?? [];
  const counts: ConsumerFinanceImportResult['counts'] = {};
  const warnings: string[] = [];

  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-import:${profileId}`}, 0))`,
  );
  if (document.mode === 'ADD') {
    const duplicate = await tx.financeDataImportReceipt.findUnique({
      where: {
        profileId_requestFingerprint: {
          profileId,
          requestFingerprint: fingerprint,
        },
      },
    });
    if (duplicate) {
      return {
        result: {
          importId: duplicate.id,
          duplicate: true,
          imported: duplicate.importedCount,
          counts: duplicate.counts as ConsumerFinanceImportResult['counts'],
          warnings: duplicate.warnings as string[],
        },
        scheduledAt: [],
      };
    }
  }
  stopIfAborted(signal);

  if (document.mode === 'REPLACE') {
    await clearFinanceDataForReplacement(tx, profileId);
    warnings.push('Existing Finance data was replaced before import.');
    stopIfAborted(signal);
  }

  if (document.settings) {
    await tx.financeProfile.update({
      where: { id: profileId },
      data: {
        ...(document.settings.defaultCurrency
          ? { defaultCurrency: document.settings.defaultCurrency }
          : {}),
        ...(document.settings.timezone
          ? { timezone: document.settings.timezone }
          : {}),
        ...(document.settings.locale
          ? { locale: document.settings.locale }
          : {}),
        ...(document.settings.displayName
          ? { displayName: document.settings.displayName.trim() }
          : {}),
      },
    });
  }
  report(onProgress, 'document', document.settings ? 1 : 0, 1);

  const accountIds = idMap(accounts);
  await tx.financeAccount.createMany({
    data: accounts.map((row) => ({
      id: accountIds.get(row.ref)!,
      profileId,
      name: row.name.trim(),
      emoji: row.emoji?.trim() || null,
      type: row.type,
      currency: row.currency,
      openingBalance: decimal(row.openingBalance),
      archivedAt: optionalDate(row.archivedAt),
    })),
  });
  counts.accounts = accounts.length;
  report(onProgress, 'accounts', accounts.length, 2);
  stopIfAborted(signal);

  const categoryIds = idMap(categories);
  const keyedCategories = categories.filter((row) => row.key);
  if (keyedCategories.length) {
    const existing = await tx.financeCategory.findMany({
      where: {
        profileId,
        OR: keyedCategories.map((row) => ({ type: row.type, key: row.key! })),
      },
      select: { id: true, type: true, key: true },
    });
    for (const row of existing) {
      const source = keyedCategories.find(
        (item) => item.type === row.type && item.key === row.key,
      );
      if (source) categoryIds.set(source.ref, row.id);
    }
  }
  const existingCategoryIds = new Set(
    (
      await tx.financeCategory.findMany({
        where: { profileId, id: { in: [...categoryIds.values()] } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  const createdCategories = await tx.financeCategory.createMany({
    data: categories
      .filter((row) => !existingCategoryIds.has(categoryIds.get(row.ref)!))
      .map((row) => ({
        id: categoryIds.get(row.ref)!,
        profileId,
        parentId: row.parentRef ? categoryIds.get(row.parentRef)! : null,
        name: row.name.trim(),
        emoji: row.emoji?.trim() || null,
        type: row.type,
        key: row.key?.trim() || null,
        archivedAt: optionalDate(row.archivedAt),
      })),
  });
  counts.categories = createdCategories.count;
  if (existingCategoryIds.size)
    warnings.push(
      `${existingCategoryIds.size} system categories were reused by key.`,
    );
  report(onProgress, 'categories', categories.length, 3);
  stopIfAborted(signal);

  const transactionIds = idMap(transactions);
  const accountByRef = new Map(accounts.map((row) => [row.ref, row]));
  await tx.financeTransaction.createMany({
    data: transactions.map((row) => {
      const account = accountByRef.get(row.accountRef)!;
      const snapshot = rates.transactions.get(row.ref)!;
      const amount = decimal(row.amount);
      const purpose = row.purpose ?? ('ORDINARY' as const);
      const economicAmount =
        purpose === 'ORDINARY'
          ? decimal(row.economicAmount ?? row.amount)
          : new Prisma.Decimal(0);
      return {
        id: transactionIds.get(row.ref)!,
        profileId,
        accountId: accountIds.get(row.accountRef)!,
        categoryId: row.categoryRef ? categoryIds.get(row.categoryRef)! : null,
        type: row.type,
        purpose,
        amount,
        economicAmount,
        currency: account.currency,
        amountInDefaultCurrency: amount
          .mul(snapshot.default.rate)
          .toDecimalPlaces(8),
        exchangeRateToDefault: decimal(snapshot.default.rate),
        valuationCurrency: 'USD',
        amountInValuationCurrency: amount
          .mul(snapshot.usd.rate)
          .toDecimalPlaces(8),
        economicAmountInValuationCurrency: economicAmount
          .mul(snapshot.usd.rate)
          .toDecimalPlaces(8),
        exchangeRateToValuation: decimal(snapshot.usd.rate),
        valuationRateAt: snapshot.usd.rateAt,
        occurredAt: new Date(row.occurredAt),
        description: row.description?.trim() || null,
        merchantDisplay: row.merchantDisplay?.trim() || null,
        source: 'MINI_APP' as const,
        necessity:
          row.type === 'EXPENSE' && purpose === 'ORDINARY'
            ? (row.necessity ?? 'UNSPECIFIED')
            : 'UNSPECIFIED',
      };
    }),
  });
  const transactionItems = transactions.flatMap((row) => {
    const account = accountByRef.get(row.accountRef)!;
    return (row.items ?? []).map((item) => ({
      transactionId: transactionIds.get(row.ref)!,
      displayName: item.displayName.trim(),
      quantity: item.quantity ? decimal(item.quantity) : null,
      unitPrice: item.unitPrice ? decimal(item.unitPrice) : null,
      totalAmount: decimal(item.totalAmount),
      currency: account.currency,
      categoryId: item.categoryRef ? categoryIds.get(item.categoryRef)! : null,
      metadata: (item.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    }));
  });
  await tx.financeTransactionItem.createMany({ data: transactionItems });
  counts.transactions = transactions.length;
  report(onProgress, 'transactions', transactions.length, 4);
  stopIfAborted(signal);

  const transferIds = idMap(transfers);
  await tx.financeTransfer.createMany({
    data: transfers.map((row) => {
      const from = accountByRef.get(row.fromAccountRef)!;
      const to = accountByRef.get(row.toAccountRef)!;
      return {
        id: transferIds.get(row.ref)!,
        profileId,
        fromAccountId: accountIds.get(row.fromAccountRef)!,
        toAccountId: accountIds.get(row.toAccountRef)!,
        fromAmount: decimal(row.fromAmount),
        fromCurrency: from.currency,
        toAmount: decimal(row.toAmount),
        toCurrency: to.currency,
        exchangeRate: decimal(row.toAmount).div(row.fromAmount),
        occurredAt: new Date(row.occurredAt),
        description: row.description?.trim() || null,
      };
    }),
  });
  counts.transfers = transfers.length;
  report(onProgress, 'transfers', transfers.length, 5);
  stopIfAborted(signal);

  const createdLimits = await tx.financeSpendingLimit.createMany({
    data: limits.map((row) => ({
      profileId,
      categoryId: categoryIds.get(row.categoryRef)!,
      period: 'MONTH' as const,
      amount: decimal(row.amount),
      currency: row.currency,
    })),
    skipDuplicates: true,
  });
  counts.limits = createdLimits.count;
  if (createdLimits.count !== limits.length)
    warnings.push(
      `${limits.length - createdLimits.count} existing monthly budgets were kept unchanged.`,
    );
  report(onProgress, 'limits', limits.length, 6);

  const obligations = await writeFinanceObligationImport({
    tx,
    profileId,
    document,
    accountIds,
    categoryIds,
    transactionIds,
    delivery,
    presentation,
    onProgress,
    signal,
  });
  Object.assign(counts, obligations.counts);
  stopIfAborted(signal);

  Object.assign(
    counts,
    await writeFinanceAssetImport({
      tx,
      profileId,
      document,
      rates,
      fingerprint,
      accountIds,
      transferIds,
      onProgress,
      signal,
    }),
  );

  const imported = Object.values(counts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const receipt = await tx.financeDataImportReceipt.create({
    data: {
      profileId,
      requestFingerprint: fingerprint,
      formatVersion: 1,
      importedCount: imported,
      counts,
      warnings,
    },
  });
  onProgress(
    {
      phase: 'FINALIZING',
      section: 'document',
      processed: imported,
      total: imported,
    },
    15,
    TOTAL_STEPS,
  );
  return {
    result: {
      importId: receipt.id,
      duplicate: false,
      imported,
      counts,
      warnings,
    },
    scheduledAt: obligations.scheduledAt,
  };
}
