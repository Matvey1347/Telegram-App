import { CurrencyConversionService } from './currency-conversion.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('CurrencyConversionService', () => {
  const now = new Date();
  const service = (rows: Array<Record<string, unknown>>) =>
    new CurrencyConversionService({
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as PrismaService);

  it('uses a bounded graph for arbitrary workspace cross-pairs', async () => {
    const result = await service([
      { baseCurrency: 'PLN', targetCurrency: 'USD', rate: 0.25, date: now },
      { baseCurrency: 'PLN', targetCurrency: 'UAH', rate: 10, date: now },
    ]).getRateMetadata('USD', 'UAH', 'workspace');
    expect(result).toEqual(
      expect.objectContaining({ available: true, rate: 40 }),
    );
  });

  it('does not invent a rate when no path exists', async () => {
    await expect(
      service([]).getRateMetadata('EUR', 'UAH', 'workspace'),
    ).resolves.toEqual(
      expect.objectContaining({ available: false, code: 'RATE_UNAVAILABLE' }),
    );
  });

  it('rejects stale current rates while preserving dated historical lookups', async () => {
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const rates = [
      { baseCurrency: 'USD', targetCurrency: 'UAH', rate: 40, date: old },
    ];
    await expect(
      service(rates).getRateMetadata('USD', 'UAH', 'workspace'),
    ).resolves.toEqual(
      expect.objectContaining({ available: false, code: 'RATE_STALE' }),
    );
    await expect(
      service(rates).getRateMetadata('USD', 'UAH', 'workspace', new Date()),
    ).resolves.toEqual(expect.objectContaining({ available: true, rate: 40 }));
  });

  it('reuses one prepared graph across repeated request-scoped conversions', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { baseCurrency: 'PLN', targetCurrency: 'USD', rate: 0.25, date: now },
      { baseCurrency: 'PLN', targetCurrency: 'UAH', rate: 10, date: now },
    ]);
    const conversion = new CurrencyConversionService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const source = await conversion.prepareRateSource('workspace');

    await expect(source.getRate('USD', 'UAH')).resolves.toBe(40);
    await expect(source.convertCurrency(2, 'UAH', 'USD')).resolves.toBeCloseTo(
      0.05,
    );
    await expect(source.getRate('USD', 'USD')).resolves.toBe(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const calls = queryRaw.mock.calls as unknown as Array<
      [{ values: unknown[]; strings: string[] }]
    >;
    const statement = calls[0]?.[0];
    expect(statement.values).toContain('workspace');
    expect(statement.strings.join(' ')).toContain('SELECT DISTINCT ON');
  });

  it('loads many requested historical cutoffs in one database query', async () => {
    const first = new Date('2026-01-01T12:00:00.000Z');
    const second = new Date('2026-02-01T12:00:00.000Z');
    const queryRaw = jest.fn().mockResolvedValue([
      {
        asOf: first,
        baseCurrency: 'USD',
        targetCurrency: 'UAH',
        rate: 40,
        date: first,
      },
      {
        asOf: second,
        baseCurrency: 'USD',
        targetCurrency: 'UAH',
        rate: 41,
        date: second,
      },
    ]);
    const conversion = new CurrencyConversionService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const sources = await conversion.prepareHistoricalRateSources('workspace', [
      first,
      second,
      first,
    ]);

    await expect(
      sources.get(first.toISOString())?.getRate('USD', 'UAH'),
    ).resolves.toBe(40);
    await expect(
      sources.get(second.toISOString())?.getRate('USD', 'UAH'),
    ).resolves.toBe(41);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const calls = queryRaw.mock.calls as unknown as Array<
      [
        {
          values: unknown[];
          strings: string[];
        },
      ]
    >;
    const statement = calls[0]?.[0];
    expect(
      statement.values.filter((value) => value instanceof Date),
    ).toHaveLength(2);
    expect(statement.strings.join(' ')).toContain('CROSS JOIN LATERAL');
  });
});
