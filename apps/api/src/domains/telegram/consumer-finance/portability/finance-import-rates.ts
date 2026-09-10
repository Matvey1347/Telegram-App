import { BadRequestException } from '@nestjs/common';
import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import type {
  CurrencyConversionService,
  PreparedCurrencyRateSource,
} from '../../../../common/currency-conversion.service';
import { financeRateDateForWrite } from '../ledger/finance-transaction-valuation';

type RateValue = { rate: string; rateAt: Date };

export type FinanceImportRates = {
  transactions: Map<string, { default: RateValue; usd: RateValue }>;
  savingsMovements: Map<string, { usd: RateValue }>;
  investmentCashFlows: Map<
    string,
    { investment: RateValue; default: RateValue; usd: RateValue }
  >;
  investmentValuations: Map<string, { usd: RateValue }>;
};

function unavailable(path: string, from: string, to: string): never {
  throw new BadRequestException({
    code: 'FINANCE_IMPORT_RATE_UNAVAILABLE',
    message: `No historical exchange rate is available for ${from} to ${to}`,
    path,
  });
}

export async function prepareFinanceImportRates(input: {
  document: ConsumerFinanceImportDocumentV1;
  workspaceId: string;
  defaultCurrency: string;
  conversion: CurrencyConversionService;
  signal: AbortSignal;
}): Promise<FinanceImportRates> {
  const accounts = new Map(
    (input.document.data.accounts ?? []).map((row) => [row.ref, row.currency]),
  );
  const investments = new Map(
    (input.document.data.investments ?? []).map((row) => [
      row.ref,
      row.currency,
    ]),
  );
  const sources = new Map<string, Promise<PreparedCurrencyRateSource>>();
  const rates = new Map<string, Promise<RateValue>>();
  const historicalDates: Date[] = [];
  const collectHistorical = (
    currency: string,
    targets: string[],
    at: string,
  ) => {
    if (targets.every((target) => target === currency)) return;
    const asOf = financeRateDateForWrite(new Date(at));
    if (asOf) historicalDates.push(asOf);
  };
  for (const row of input.document.data.transactions ?? [])
    collectHistorical(
      accounts.get(row.accountRef)!,
      [input.defaultCurrency, 'USD'],
      row.occurredAt,
    );
  for (const row of input.document.data.savingsMovements ?? [])
    collectHistorical(accounts.get(row.accountRef)!, ['USD'], row.occurredAt);
  for (const row of input.document.data.investmentCashFlows ?? [])
    collectHistorical(
      accounts.get(row.accountRef)!,
      [investments.get(row.investmentRef)!, input.defaultCurrency, 'USD'],
      row.occurredAt,
    );
  for (const row of input.document.data.investmentValuations ?? [])
    collectHistorical(
      investments.get(row.investmentRef)!,
      ['USD'],
      row.valuedAt,
    );
  if (input.signal.aborted) {
    const error = new Error('Import cancelled');
    error.name = 'AbortError';
    throw error;
  }
  const historicalSources = await input.conversion.prepareHistoricalRateSources(
    input.workspaceId,
    historicalDates,
  );
  if (input.signal.aborted) {
    const error = new Error('Import cancelled');
    error.name = 'AbortError';
    throw error;
  }
  for (const [key, source] of historicalSources)
    sources.set(key, Promise.resolve(source));

  const resolve = (from: string, to: string, at: string, path: string) => {
    const occurredAt = new Date(at);
    const asOf = financeRateDateForWrite(occurredAt);
    const sourceKey = asOf?.toISOString() ?? 'CURRENT';
    const rateKey = `${sourceKey}:${from}:${to}`;
    const existing = rates.get(rateKey);
    if (existing) return existing;
    const promise = (async () => {
      if (input.signal.aborted) {
        const error = new Error('Import cancelled');
        error.name = 'AbortError';
        throw error;
      }
      if (from === to) return { rate: '1', rateAt: occurredAt };
      let source = sources.get(sourceKey);
      if (!source) {
        source = input.conversion.prepareRateSource(input.workspaceId, asOf);
        sources.set(sourceKey, source);
      }
      const result = await (await source).getRateMetadata(from, to);
      if (!result.available) unavailable(path, from, to);
      return { rate: String(result.rate), rateAt: result.rateAt };
    })();
    rates.set(rateKey, promise);
    return promise;
  };

  const transactionRates = new Map<
    string,
    { default: RateValue; usd: RateValue }
  >();
  await Promise.all(
    (input.document.data.transactions ?? []).map(async (row, index) => {
      const currency = accounts.get(row.accountRef)!;
      const [defaultRate, usd] = await Promise.all([
        resolve(
          currency,
          input.defaultCurrency,
          row.occurredAt,
          `data.transactions[${index}].occurredAt`,
        ),
        resolve(
          currency,
          'USD',
          row.occurredAt,
          `data.transactions[${index}].occurredAt`,
        ),
      ]);
      transactionRates.set(row.ref, { default: defaultRate, usd });
    }),
  );

  const savingsRates = new Map<string, { usd: RateValue }>();
  await Promise.all(
    (input.document.data.savingsMovements ?? []).map(async (row, index) => {
      const currency = accounts.get(row.accountRef)!;
      savingsRates.set(row.ref, {
        usd: await resolve(
          currency,
          'USD',
          row.occurredAt,
          `data.savingsMovements[${index}].occurredAt`,
        ),
      });
    }),
  );

  const cashFlowRates = new Map<
    string,
    { investment: RateValue; default: RateValue; usd: RateValue }
  >();
  await Promise.all(
    (input.document.data.investmentCashFlows ?? []).map(async (row, index) => {
      const currency = accounts.get(row.accountRef)!;
      const investmentCurrency = investments.get(row.investmentRef)!;
      const [investment, defaultRate, usd] = await Promise.all([
        resolve(
          currency,
          investmentCurrency,
          row.occurredAt,
          `data.investmentCashFlows[${index}].occurredAt`,
        ),
        resolve(
          currency,
          input.defaultCurrency,
          row.occurredAt,
          `data.investmentCashFlows[${index}].occurredAt`,
        ),
        resolve(
          currency,
          'USD',
          row.occurredAt,
          `data.investmentCashFlows[${index}].occurredAt`,
        ),
      ]);
      cashFlowRates.set(row.ref, {
        investment,
        default: defaultRate,
        usd,
      });
    }),
  );

  const valuationRates = new Map<string, { usd: RateValue }>();
  await Promise.all(
    (input.document.data.investmentValuations ?? []).map(async (row, index) => {
      const currency = investments.get(row.investmentRef)!;
      valuationRates.set(row.ref, {
        usd: await resolve(
          currency,
          'USD',
          row.valuedAt,
          `data.investmentValuations[${index}].valuedAt`,
        ),
      });
    }),
  );

  return {
    transactions: transactionRates,
    savingsMovements: savingsRates,
    investmentCashFlows: cashFlowRates,
    investmentValuations: valuationRates,
  };
}
