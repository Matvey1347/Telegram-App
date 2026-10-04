import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type {
  ConsumerFinanceImportDocumentV1,
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from '@telegram-system/shared';
import { financeRequestFingerprint } from '../assets/finance-asset-idempotency';
import type { FinanceImportRates } from './finance-import-rates';

type Progress = (
  item: ConsumerFinanceImportProgress,
  current: number,
  total: number,
) => void;

const decimal = (value: string) => new Prisma.Decimal(value);
const idMap = (rows: ReadonlyArray<{ ref: string }>) =>
  new Map<string, string>(rows.map((row) => [row.ref, randomUUID()]));

function report(
  onProgress: Progress,
  section: ConsumerFinanceImportProgress['section'],
  processed: number,
  current: number,
) {
  onProgress(
    { phase: 'IMPORTING', section, processed, total: processed },
    current,
    15,
  );
}

function stopIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Import cancelled');
  error.name = 'AbortError';
  throw error;
}

export async function writeFinanceAssetImport(input: {
  tx: Prisma.TransactionClient;
  profileId: string;
  document: ConsumerFinanceImportDocumentV1;
  rates: FinanceImportRates;
  fingerprint: string;
  accountIds: ReadonlyMap<string, string>;
  transferIds: ReadonlyMap<string, string>;
  onProgress: Progress;
  signal: AbortSignal;
}): Promise<ConsumerFinanceImportResult['counts']> {
  const { tx, profileId, document, rates, fingerprint, onProgress, signal } =
    input;
  const accounts = document.data.accounts ?? [];
  const savingsGoals = document.data.savingsGoals ?? [];
  const savingsMovements = document.data.savingsMovements ?? [];
  const investments = document.data.investments ?? [];
  const investmentCashFlows = document.data.investmentCashFlows ?? [];
  const investmentValuations = document.data.investmentValuations ?? [];
  const accountByRef = new Map(accounts.map((row) => [row.ref, row]));
  const counts: ConsumerFinanceImportResult['counts'] = {};

  const goalIds = idMap(savingsGoals);
  const goalAllocated = new Map<string, Prisma.Decimal>();
  for (const movement of savingsMovements) {
    const amount = decimal(movement.amount);
    if (movement.fromGoalRef)
      goalAllocated.set(
        movement.fromGoalRef,
        (goalAllocated.get(movement.fromGoalRef) ?? decimal('0')).minus(amount),
      );
    if (movement.toGoalRef)
      goalAllocated.set(
        movement.toGoalRef,
        (goalAllocated.get(movement.toGoalRef) ?? decimal('0')).plus(amount),
      );
  }
  await tx.financeSavingsGoal.createMany({
    data: savingsGoals.map((row) => {
      const allocated = goalAllocated.get(row.ref) ?? decimal('0');
      const initial = decimal(row.initialAmount ?? '0');
      return {
        id: goalIds.get(row.ref)!,
        profileId,
        name: row.name.trim(),
        targetAmount: decimal(row.targetAmount),
        currency: row.currency,
        targetDate: row.targetDate ? new Date(row.targetDate) : null,
        note: row.note?.trim() || null,
        status: row.status ?? 'ACTIVE',
        currentAllocated: allocated.plus(initial),
        linkedAllocated: allocated,
        legacyUnlinkedAmount: initial,
        completedAt: row.status === 'COMPLETED' ? new Date() : null,
        archivedAt: row.status === 'ARCHIVED' ? new Date() : null,
      };
    }),
  });
  counts.savingsGoals = savingsGoals.length;
  report(onProgress, 'savingsGoals', savingsGoals.length, 10);

  await tx.financeSavingsMovement.createMany({
    data: savingsMovements.map((row) => {
      const account = accountByRef.get(row.accountRef)!;
      const usd = rates.savingsMovements.get(row.ref)!.usd;
      return {
        id: randomUUID(),
        profileId,
        accountId: input.accountIds.get(row.accountRef)!,
        fromGoalId: row.fromGoalRef ? goalIds.get(row.fromGoalRef)! : null,
        toGoalId: row.toGoalRef ? goalIds.get(row.toGoalRef)! : null,
        kind: row.kind,
        amount: decimal(row.amount),
        currency: account.currency,
        valuationCurrency: 'USD',
        amountInValuationCurrency: decimal(row.amount)
          .mul(usd.rate)
          .toDecimalPlaces(8),
        exchangeRateToValuation: decimal(usd.rate),
        valuationRateAt: usd.rateAt,
        occurredAt: new Date(row.occurredAt),
        note: row.note?.trim() || null,
        linkedTransferId: row.linkedTransferRef
          ? input.transferIds.get(row.linkedTransferRef)!
          : null,
        idempotencyKey: `import:${fingerprint}:${row.ref}`,
        requestFingerprint: financeRequestFingerprint(row),
      };
    }),
  });
  counts.savingsMovements = savingsMovements.length;
  report(onProgress, 'savingsMovements', savingsMovements.length, 11);
  stopIfAborted(signal);

  const investmentIds = idMap(investments);
  const investmentByRef = new Map(investments.map((row) => [row.ref, row]));
  const flowsByInvestment = new Map<string, typeof investmentCashFlows>();
  for (const flow of investmentCashFlows)
    flowsByInvestment.set(flow.investmentRef, [
      ...(flowsByInvestment.get(flow.investmentRef) ?? []),
      flow,
    ]);
  const valuationsByInvestment = new Map<string, typeof investmentValuations>();
  for (const valuation of investmentValuations)
    valuationsByInvestment.set(valuation.investmentRef, [
      ...(valuationsByInvestment.get(valuation.investmentRef) ?? []),
      valuation,
    ]);
  const correctedValuationRefs = new Set(
    investmentValuations.flatMap((row) =>
      row.correctsRef ? [row.correctsRef] : [],
    ),
  );
  const valuationCreatedAt = new Map<string, Date>();
  const importedAt = Date.now();
  let previousCreatedAt = Number.NEGATIVE_INFINITY;
  investmentValuations
    .map((row, index) => ({
      row,
      requested: row.createdAt ? Date.parse(row.createdAt) : importedAt + index,
    }))
    .sort(
      (left, right) =>
        left.requested - right.requested ||
        left.row.ref.localeCompare(right.row.ref),
    )
    .forEach(({ row, requested }) => {
      const timestamp = Math.max(requested, previousCreatedAt + 1);
      previousCreatedAt = timestamp;
      valuationCreatedAt.set(row.ref, new Date(timestamp));
    });
  await tx.financeInvestment.createMany({
    data: investments.map((row) => {
      const flows = flowsByInvestment.get(row.ref) ?? [];
      const total = (
        kind: 'CONTRIBUTION' | 'RETURN',
        rate: 'investment' | 'usd',
      ) =>
        flows
          .filter((flow) => flow.kind === kind)
          .reduce(
            (sum, flow) =>
              sum.plus(
                decimal(flow.amount).mul(
                  rates.investmentCashFlows.get(flow.ref)![rate].rate,
                ),
              ),
            decimal('0'),
          );
      const invested = total('CONTRIBUTION', 'investment');
      const returned = total('RETURN', 'investment');
      const investedUsd = total('CONTRIBUTION', 'usd');
      const returnedUsd = total('RETURN', 'usd');
      const latest = [...(valuationsByInvestment.get(row.ref) ?? [])]
        .filter((valuation) => !correctedValuationRefs.has(valuation.ref))
        .sort(
          (left, right) =>
            Date.parse(right.valuedAt) - Date.parse(left.valuedAt) ||
            valuationCreatedAt.get(right.ref)!.getTime() -
              valuationCreatedAt.get(left.ref)!.getTime() ||
            right.ref.localeCompare(left.ref),
        )[0];
      const currentValue = latest
        ? decimal(latest.value)
        : invested.minus(returned);
      const currentValueUsd = latest
        ? decimal(latest.value).mul(
            rates.investmentValuations.get(latest.ref)!.usd.rate,
          )
        : investedUsd.minus(returnedUsd);
      return {
        id: investmentIds.get(row.ref)!,
        profileId,
        name: row.name.trim(),
        description: row.description?.trim() || null,
        type: row.type,
        currency: row.currency,
        status: row.status ?? 'ACTIVE',
        startedAt: new Date(row.startedAt),
        closedAt: row.closedAt ? new Date(row.closedAt) : null,
        archivedAt: row.status === 'ARCHIVED' ? new Date() : null,
        totalInvested: invested.toDecimalPlaces(8),
        totalReturned: returned.toDecimalPlaces(8),
        totalInvestedInValuationCurrency: investedUsd.toDecimalPlaces(8),
        totalReturnedInValuationCurrency: returnedUsd.toDecimalPlaces(8),
        currentValue: currentValue.toDecimalPlaces(8),
        currentValueInValuationCurrency: currentValueUsd.toDecimalPlaces(8),
        valuationCurrency: 'USD',
        currentValuationAt: latest ? new Date(latest.valuedAt) : null,
      };
    }),
  });
  counts.investments = investments.length;
  report(onProgress, 'investments', investments.length, 12);

  const transactionIds = idMap(investmentCashFlows);
  await tx.financeTransaction.createMany({
    data: investmentCashFlows.map((row) => {
      const account = accountByRef.get(row.accountRef)!;
      const snapshot = rates.investmentCashFlows.get(row.ref)!;
      const amount = decimal(row.amount);
      return {
        id: transactionIds.get(row.ref)!,
        profileId,
        accountId: input.accountIds.get(row.accountRef)!,
        type:
          row.kind === 'CONTRIBUTION'
            ? ('EXPENSE' as const)
            : ('INCOME' as const),
        purpose:
          row.kind === 'CONTRIBUTION'
            ? ('INVESTMENT_CONTRIBUTION' as const)
            : ('INVESTMENT_RETURN' as const),
        amount,
        currency: account.currency,
        amountInDefaultCurrency: amount
          .mul(snapshot.default.rate)
          .toDecimalPlaces(8),
        exchangeRateToDefault: decimal(snapshot.default.rate),
        valuationCurrency: 'USD',
        amountInValuationCurrency: amount
          .mul(snapshot.usd.rate)
          .toDecimalPlaces(8),
        exchangeRateToValuation: decimal(snapshot.usd.rate),
        valuationRateAt: snapshot.usd.rateAt,
        occurredAt: new Date(row.occurredAt),
        description:
          row.note?.trim() || investmentByRef.get(row.investmentRef)!.name,
        source: 'MINI_APP' as const,
      };
    }),
  });
  await tx.financeInvestmentCashFlow.createMany({
    data: investmentCashFlows.map((row) => {
      const rate = rates.investmentCashFlows.get(row.ref)!.investment;
      return {
        profileId,
        investmentId: investmentIds.get(row.investmentRef)!,
        accountId: input.accountIds.get(row.accountRef)!,
        transactionId: transactionIds.get(row.ref)!,
        kind: row.kind,
        amountInInvestmentCurrency: decimal(row.amount)
          .mul(rate.rate)
          .toDecimalPlaces(8),
        exchangeRateToInvestment: decimal(rate.rate),
        investmentRateAt: rate.rateAt,
        idempotencyKey: `import:${fingerprint}:${row.ref}`,
        requestFingerprint: financeRequestFingerprint(row),
        occurredAt: new Date(row.occurredAt),
        note: row.note?.trim() || null,
      };
    }),
  });
  counts.investmentCashFlows = investmentCashFlows.length;
  report(onProgress, 'investmentCashFlows', investmentCashFlows.length, 13);
  stopIfAborted(signal);

  const valuationIds = idMap(investmentValuations);
  await tx.financeInvestmentValuation.createMany({
    data: investmentValuations.map((row) => {
      const usd = rates.investmentValuations.get(row.ref)!.usd;
      return {
        id: valuationIds.get(row.ref)!,
        profileId,
        investmentId: investmentIds.get(row.investmentRef)!,
        value: decimal(row.value),
        currency: investmentByRef.get(row.investmentRef)!.currency,
        valuationCurrency: 'USD',
        amountInValuationCurrency: decimal(row.value)
          .mul(usd.rate)
          .toDecimalPlaces(8),
        exchangeRateToValuation: decimal(usd.rate),
        valuationRateAt: usd.rateAt,
        valuedAt: new Date(row.valuedAt),
        createdAt: valuationCreatedAt.get(row.ref)!,
        note: row.note?.trim() || null,
        correctsValuationId: row.correctsRef
          ? valuationIds.get(row.correctsRef)!
          : null,
        idempotencyKey: `import:${fingerprint}:${row.ref}`,
        requestFingerprint: financeRequestFingerprint(row),
      };
    }),
  });
  counts.investmentValuations = investmentValuations.length;
  report(onProgress, 'investmentValuations', investmentValuations.length, 14);
  stopIfAborted(signal);
  return counts;
}
