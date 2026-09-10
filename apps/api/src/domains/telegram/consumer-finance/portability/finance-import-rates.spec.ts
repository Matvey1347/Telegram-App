import { prepareFinanceImportRates } from './finance-import-rates';

describe('prepareFinanceImportRates', () => {
  it('batches distinct historical cutoffs instead of issuing one query per row', async () => {
    const dates = ['2025-01-01T12:00:00.000Z', '2025-02-01T12:00:00.000Z'];
    const source = {
      getRateMetadata: jest.fn((_from: string, to: string) =>
        Promise.resolve({
          available: true,
          rate: to === 'USD' ? 0.25 : 10,
          rateAt: new Date(dates[0] ?? ''),
          stale: false,
        }),
      ),
    };
    const conversion = {
      prepareHistoricalRateSources: jest
        .fn()
        .mockResolvedValue(new Map(dates.map((date) => [date, source]))),
      prepareRateSource: jest.fn(),
    };

    const result = await prepareFinanceImportRates({
      document: {
        format: 'telegram-system.consumer-finance',
        version: 1,
        mode: 'ADD',
        data: {
          accounts: [
            { ref: 'card', name: 'Card', type: 'CARD', currency: 'PLN' },
          ],
          transactions: dates.map((occurredAt, index) => ({
            ref: `transaction-${index}`,
            accountRef: 'card',
            type: 'EXPENSE',
            amount: '10',
            occurredAt,
          })),
        },
      },
      workspaceId: 'workspace-1',
      defaultCurrency: 'UAH',
      conversion: conversion as never,
      signal: new AbortController().signal,
    });

    expect(conversion.prepareHistoricalRateSources).toHaveBeenCalledTimes(1);
    const calls = conversion.prepareHistoricalRateSources.mock
      .calls as unknown as Array<[string, Date[]]>;
    expect(calls[0]?.[1]).toHaveLength(2);
    expect(conversion.prepareRateSource).not.toHaveBeenCalled();
    expect(result.transactions.get('transaction-0')?.default.rate).toBe('10');
    expect(result.transactions.get('transaction-0')?.usd.rate).toBe('0.25');
  });
});
