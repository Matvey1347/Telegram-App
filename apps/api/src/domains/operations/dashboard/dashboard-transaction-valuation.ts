import { ServiceUnavailableException } from '@nestjs/common';
import type { CurrencyConversionService } from '../../../common/currency-conversion.service';

type NativeTransactionAmount = {
  date: Date;
  amount?: unknown;
  currency?: string | null;
  amountInPrimaryCurrency: unknown;
};

const dec = (value: unknown) => Number(value ?? 0);

/** Revalues native amounts into the workspace's current primary currency. */
export async function valueDashboardTransactions<
  T extends NativeTransactionAmount,
>(input: {
  transactions: T[];
  primaryCurrency: string;
  workspaceId: string;
  conversionService: CurrencyConversionService;
}) {
  const primaryCurrency = input.primaryCurrency.toUpperCase();
  const foreignDates = input.transactions
    .filter(
      (transaction) =>
        transaction.amount != null &&
        transaction.currency &&
        transaction.currency.toUpperCase() !== primaryCurrency,
    )
    .map((transaction) => transaction.date);
  const historicalSources = foreignDates.length
    ? await input.conversionService.prepareHistoricalRateSources(
        input.workspaceId,
        foreignDates,
      )
    : new Map();
  let currentSource = undefined as
    | ReturnType<CurrencyConversionService['prepareRateSource']>
    | undefined;

  return Promise.all(
    input.transactions.map(async (transaction) => {
      if (transaction.amount == null || !transaction.currency) {
        return transaction;
      }
      const currency = transaction.currency.toUpperCase();
      if (currency === primaryCurrency) {
        return {
          ...transaction,
          amountInPrimaryCurrency: dec(transaction.amount),
        };
      }

      const historicalValue = await historicalSources
        .get(transaction.date.toISOString())
        ?.convertCurrency(dec(transaction.amount), currency, primaryCurrency);
      const currentValue =
        historicalValue ??
        (await (
          await (currentSource ??= input.conversionService.prepareRateSource(
            input.workspaceId,
          ))
        ).convertCurrency(dec(transaction.amount), currency, primaryCurrency));
      if (currentValue == null) {
        throw new ServiceUnavailableException(
          `Exchange rate unavailable for ${currency} to ${primaryCurrency}.`,
        );
      }
      return { ...transaction, amountInPrimaryCurrency: currentValue };
    }),
  );
}
