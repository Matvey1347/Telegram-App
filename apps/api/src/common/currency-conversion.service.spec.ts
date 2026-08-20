import { CurrencyConversionService } from './currency-conversion.service';

describe('CurrencyConversionService', () => {
  const now = new Date();
  const service = (rows: Array<Record<string, unknown>>) =>
    new CurrencyConversionService({
      exchangeRate: { findMany: jest.fn().mockResolvedValue(rows) },
    } as any);

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
});
