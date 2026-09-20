import { HistoricalExchangeRateService } from './historical-exchange-rate.service';

describe('HistoricalExchangeRateService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stores fresh same-day rates for current reads after an import', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T08:00:00.000Z'));
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: 'success',
        rates: { PLN: 4.21, UAH: 48.5, USD: 1.17 },
      }),
    } as never);
    const service = new HistoricalExchangeRateService({
      exchangeRate: { createMany },
    } as never);

    await expect(
      service.ensureCurrentRates({
        currencies: ['PLN', 'UAH', 'USD'],
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(3);
    const calls = createMany.mock.calls as unknown as Array<
      [{ data: Array<Record<string, unknown>>; skipDuplicates: boolean }]
    >;
    expect(calls[0][0].skipDuplicates).toBe(true);
    expect(
      calls[0][0].data.find((row) => row.targetCurrency === 'UAH'),
    ).toEqual({
        baseCurrency: 'EUR',
      targetCurrency: 'UAH',
      rate: 48.5,
      date: new Date('2026-09-14T00:00:00.000Z'),
      source: 'open.er-api.com',
    });
  });

  it('downloads one bounded range and stores the latest published rate for a weekend', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        base: 'EUR',
        rates: {
          '2025-09-25': { PLN: 4.25, USD: 1.17 },
          '2025-09-26': { PLN: 4.27, USD: 1.18 },
        },
      }),
    } as never);
    const service = new HistoricalExchangeRateService({
      exchangeRate: { createMany },
    } as never);

    await expect(
      service.ensureRates({
        dates: [new Date('2025-09-28T10:00:00.000Z')],
        currencies: ['PLN', 'USD'],
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/2025-09-21..2025-09-28?');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          baseCurrency: 'EUR',
          targetCurrency: 'PLN',
          rate: 4.27,
          date: new Date('2025-09-26T00:00:00.000Z'),
        }),
        expect.objectContaining({
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.18,
          date: new Date('2025-09-26T00:00:00.000Z'),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('does not write partial or invalid provider rates', async () => {
    const createMany = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        base: 'EUR',
        rates: { '2025-09-26': { PLN: 0, USD: Number.NaN } },
      }),
    } as never);
    const service = new HistoricalExchangeRateService({
      exchangeRate: { createMany },
    } as never);

    await expect(
      service.ensureRates({
        dates: [new Date('2025-09-26T10:00:00.000Z')],
        currencies: ['PLN', 'USD'],
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('does not write when every provider is unavailable', async () => {
    const createMany = jest.fn();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as never);
    const service = new HistoricalExchangeRateService({
      exchangeRate: { createMany },
    } as never);

    await expect(
      service.ensureRates({
        dates: [new Date('2025-09-26T10:00:00.000Z')],
        currencies: ['PLN', 'USD'],
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('fills UAH through the official NBU rate when Frankfurter omits it', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes('frankfurter'))
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({
            base: 'EUR',
            rates: {
              '2026-04-07': { PLN: 4.2753, USD: 1.1557 },
            },
          }),
        } as never);
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            exchangedate: '07.04.2026',
            cc: 'EUR',
            rate_per_unit: 50.321,
          },
        ]),
      } as never);
    });
    const service = new HistoricalExchangeRateService({
      exchangeRate: { createMany },
    } as never);

    await expect(
      service.ensureRates({
        dates: [new Date('2026-04-07T10:00:00.000Z')],
        currencies: ['PLN', 'UAH', 'USD'],
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(3);
    const calls = createMany.mock.calls as unknown as Array<
      [{ data: Array<Record<string, unknown>>; skipDuplicates: boolean }]
    >;
    expect(calls[0][0].skipDuplicates).toBe(true);
    expect(
      calls[0][0].data.find((row) => row.source === 'bank.gov.ua'),
    ).toEqual({
        baseCurrency: 'EUR',
      targetCurrency: 'UAH',
      rate: 50.321,
      date: new Date('2026-04-07T00:00:00.000Z'),
      source: 'bank.gov.ua',
    });
  });
});
