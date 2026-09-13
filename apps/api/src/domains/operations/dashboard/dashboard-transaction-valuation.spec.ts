import { ServiceUnavailableException } from '@nestjs/common';
import { valueDashboardTransactions } from './dashboard-transaction-valuation';

describe('valueDashboardTransactions', () => {
  it('uses native amounts for the current primary currency', async () => {
    const conversion = {
      prepareHistoricalRateSources: jest.fn(),
      prepareRateSource: jest.fn(),
    };

    const [transaction] = await valueDashboardTransactions({
      transactions: [
        {
          date: new Date('2026-09-08T12:00:00Z'),
          amount: 340,
          currency: 'UAH',
          amountInPrimaryCurrency: 7.9,
        },
      ],
      primaryCurrency: 'UAH',
      workspaceId: 'workspace-1',
      conversionService: conversion as never,
    });

    expect(transaction.amountInPrimaryCurrency).toBe(340);
    expect(conversion.prepareHistoricalRateSources).not.toHaveBeenCalled();
    expect(conversion.prepareRateSource).not.toHaveBeenCalled();
  });

  it('fails instead of relabeling a stale amount when no conversion exists', async () => {
    const date = new Date('2026-09-09T12:00:00Z');
    const unavailableSource = {
      convertCurrency: jest.fn().mockResolvedValue(null),
    };
    const conversion = {
      prepareHistoricalRateSources: jest
        .fn()
        .mockResolvedValue(new Map([[date.toISOString(), unavailableSource]])),
      prepareRateSource: jest.fn().mockResolvedValue(unavailableSource),
    };

    await expect(
      valueDashboardTransactions({
        transactions: [
          {
            date,
            amount: 2_500,
            currency: 'PLN',
            amountInPrimaryCurrency: 57,
          },
        ],
        primaryCurrency: 'UAH',
        workspaceId: 'workspace-1',
        conversionService: conversion as never,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
