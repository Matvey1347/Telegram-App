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
    const historicalRates = {
      ensureCurrentRates: jest.fn().mockResolvedValue(2),
      ensureRates: jest.fn(),
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
      historicalRates: historicalRates as never,
      signal: new AbortController().signal,
    });

    expect(conversion.prepareHistoricalRateSources).toHaveBeenCalledTimes(1);
    const calls = conversion.prepareHistoricalRateSources.mock
      .calls as unknown as Array<[string, Date[]]>;
    expect(calls[0]?.[1]).toHaveLength(2);
    expect(conversion.prepareRateSource).not.toHaveBeenCalled();
    expect(historicalRates.ensureCurrentRates).toHaveBeenCalledTimes(1);
    expect(historicalRates.ensureRates).not.toHaveBeenCalled();
    expect(result.transactions.get('transaction-0')?.default.rate).toBe('10');
    expect(result.transactions.get('transaction-0')?.usd.rate).toBe('0.25');
  });

  it('backfills a missing PLN to USD rate and reloads the prepared sources', async () => {
    const date = '2025-09-28T10:00:00.000Z';
    const unavailable = {
      getRateMetadata: jest.fn().mockResolvedValue({ available: false }),
    };
    const available = {
      getRateMetadata: jest.fn().mockResolvedValue({
        available: true,
        rate: 0.26,
        rateAt: new Date('2025-09-26T00:00:00.000Z'),
        stale: false,
      }),
    };
    const conversion = {
      prepareHistoricalRateSources: jest
        .fn()
        .mockResolvedValueOnce(new Map([[date, unavailable]]))
        .mockResolvedValueOnce(new Map([[date, available]])),
      prepareRateSource: jest.fn(),
    };
    const historicalRates = {
      ensureCurrentRates: jest.fn().mockResolvedValue(2),
      ensureRates: jest.fn().mockResolvedValue(2),
    };

    const result = await prepareFinanceImportRates({
      document: {
        format: 'telegram-system.consumer-finance',
        version: 1,
        mode: 'ADD',
        settings: { defaultCurrency: 'PLN' },
        data: {
          accounts: [
            { ref: 'pln', name: 'PLN', type: 'CARD', currency: 'PLN' },
          ],
          transactions: [
            {
              ref: 'expense-0001',
              accountRef: 'pln',
              type: 'EXPENSE',
              amount: '2',
              occurredAt: date,
            },
          ],
        },
      },
      workspaceId: 'workspace-1',
      defaultCurrency: 'PLN',
      conversion: conversion as never,
      historicalRates: historicalRates as never,
      signal: new AbortController().signal,
    });

    expect(historicalRates.ensureRates).toHaveBeenCalledTimes(1);
    const backfillCalls = historicalRates.ensureRates.mock
      .calls as unknown as Array<
      [
        {
          workspaceId: string;
          dates: Date[];
          currencies: string[];
        },
      ]
    >;
    const backfillInput = backfillCalls[0][0];
    expect(backfillInput.workspaceId).toBe('workspace-1');
    expect(backfillInput.dates).toEqual([new Date(date)]);
    expect([...backfillInput.currencies].sort()).toEqual(['PLN', 'USD']);
    expect(conversion.prepareHistoricalRateSources).toHaveBeenCalledTimes(2);
    expect(result.transactions.get('expense-0001')?.usd).toEqual({
      rate: '0.26',
      rateAt: new Date('2025-09-26T00:00:00.000Z'),
    });
  });
});
