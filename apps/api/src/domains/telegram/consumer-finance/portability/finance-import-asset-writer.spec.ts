import { Prisma } from '@prisma/client';
import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import { writeFinanceAssetImport } from './finance-import-asset-writer';

describe('writeFinanceAssetImport', () => {
  it('uses only terminal valuations and preserves their deterministic order', async () => {
    const tx = {
      financeSavingsGoal: { createMany: jest.fn().mockResolvedValue({}) },
      financeSavingsMovement: { createMany: jest.fn().mockResolvedValue({}) },
      financeInvestment: { createMany: jest.fn().mockResolvedValue({}) },
      financeTransaction: { createMany: jest.fn().mockResolvedValue({}) },
      financeInvestmentCashFlow: {
        createMany: jest.fn().mockResolvedValue({}),
      },
      financeInvestmentValuation: {
        createMany: jest.fn().mockResolvedValue({}),
      },
    };
    const document: ConsumerFinanceImportDocumentV1 = {
      format: 'telegram-system.consumer-finance',
      version: 1,
      mode: 'ADD',
      data: {
        investments: [
          {
            ref: 'investment',
            name: 'Company',
            type: 'BUSINESS',
            currency: 'UAH',
            startedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        investmentValuations: [
          {
            ref: 'superseded',
            investmentRef: 'investment',
            value: '900',
            valuedAt: '2026-09-10T00:00:00.000Z',
            createdAt: '2026-09-10T01:00:00.000Z',
          },
          {
            ref: 'correction',
            investmentRef: 'investment',
            value: '800',
            valuedAt: '2026-09-09T00:00:00.000Z',
            createdAt: '2026-09-11T01:00:00.000Z',
            correctsRef: 'superseded',
          },
        ],
      },
    };
    const rates = {
      transactions: new Map(),
      savingsMovements: new Map(),
      investmentCashFlows: new Map(),
      investmentValuations: new Map([
        [
          'superseded',
          { usd: { rate: '0.025', rateAt: new Date('2026-09-10') } },
        ],
        [
          'correction',
          { usd: { rate: '0.025', rateAt: new Date('2026-09-09') } },
        ],
      ]),
    };

    await writeFinanceAssetImport({
      tx: tx as never,
      profileId: 'profile-1',
      document,
      rates,
      fingerprint: 'fingerprint',
      accountIds: new Map(),
      transferIds: new Map(),
      onProgress: jest.fn(),
      signal: new AbortController().signal,
    });

    const investmentCalls = tx.financeInvestment.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            currentValue: Prisma.Decimal;
            currentValuationAt: Date;
          }>;
        },
      ]
    >;
    const investmentInput = investmentCalls[0]?.[0].data[0];
    expect(investmentInput.currentValue.toString()).toBe('800');
    expect(investmentInput.currentValuationAt.toISOString()).toBe(
      '2026-09-09T00:00:00.000Z',
    );
    const valuationCalls = tx.financeInvestmentValuation.createMany.mock
      .calls as unknown as Array<[{ data: Array<{ createdAt: Date }> }]>;
    const valuationInput = valuationCalls[0]?.[0].data;
    expect(valuationInput.map((row) => row.createdAt.toISOString())).toEqual([
      '2026-09-10T01:00:00.000Z',
      '2026-09-11T01:00:00.000Z',
    ]);
  });
});
