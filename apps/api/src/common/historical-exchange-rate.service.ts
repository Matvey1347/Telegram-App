import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type FrankfurterPayload = {
  base?: string;
  rates?: Record<string, Record<string, number>>;
};

type HistoricalRateObservation = {
  date: Date;
  values: Record<string, number>;
};

type NbuRate = {
  exchangedate?: string;
  cc?: string;
  rate_per_unit?: number;
  rate?: number;
  units?: number;
};

type ProviderRateRow = {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  date: Date;
  source: string;
};

const utcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class HistoricalExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCurrentRates(input: {
    workspaceId: string;
    currencies: string[];
    signal: AbortSignal;
  }): Promise<number> {
    const currencies = [
      ...new Set(input.currencies.map((value) => value.toUpperCase())),
    ].filter((currency) => currency !== 'EUR');
    if (!currencies.length) return 0;
    const response = await fetch('https://open.er-api.com/v6/latest/EUR', {
      signal: input.signal,
    });
    if (!response.ok)
      throw new Error(
        `Current exchange-rate provider returned HTTP ${response.status}`,
      );
    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    if (payload.result !== 'success' || !payload.rates)
      throw new Error(
        'Current exchange-rate provider returned an invalid response',
      );
    const rows = currencies
      .map((targetCurrency) => ({
        workspaceId: input.workspaceId,
        baseCurrency: 'EUR',
        targetCurrency,
        rate: payload.rates?.[targetCurrency],
        date: utcDay(new Date()),
        source: 'open.er-api.com',
      }))
      .filter(
        (row): row is typeof row & { rate: number } =>
          typeof row.rate === 'number' &&
          Number.isFinite(row.rate) &&
          row.rate > 0,
      );
    if (!rows.length) return 0;
    await this.prisma.exchangeRate.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return rows.length;
  }

  async ensureRates(input: {
    workspaceId: string;
    dates: Date[];
    currencies: string[];
    signal: AbortSignal;
  }): Promise<number> {
    const dates = [
      ...new Map(
        input.dates.map((date) => [isoDay(date), utcDay(date)]),
      ).values(),
    ];
    const currencies = [
      ...new Set(input.currencies.map((value) => value.toUpperCase())),
    ]
      .filter((currency) => currency !== 'EUR')
      .sort();
    if (!dates.length || !currencies.length) return 0;

    const datesByDecade = new Map<number, Date[]>();
    for (const date of dates) {
      const decade = Math.floor(date.getUTCFullYear() / 10) * 10;
      const group = datesByDecade.get(decade) ?? [];
      group.push(date);
      datesByDecade.set(decade, group);
    }

    const fetched: ProviderRateRow[] = [];
    // At most one provider request per represented decade, executed
    // sequentially so a large archival import cannot create a request burst.
    for (const group of datesByDecade.values()) {
      let frankfurter: HistoricalRateObservation[] = [];
      try {
        frankfurter = await this.fetchFrankfurterRates(
          group,
          currencies,
          input.signal,
        );
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
      }
      fetched.push(
        ...frankfurter.flatMap(({ date, values }) =>
          Object.entries(values).map(([targetCurrency, rate]) => ({
            baseCurrency: 'EUR',
            targetCurrency,
            rate,
            date,
            source: 'frankfurter.dev',
          })),
        ),
      );
      const missing = currencies.filter(
        (currency) =>
          currency !== 'EUR' &&
          (!frankfurter.length ||
            frankfurter.some((row) => row.values[currency] === undefined)),
      );
      if (missing.length) {
        const nbuCurrencies = [
          ...new Set([
            'EUR',
            ...missing.filter((currency) => currency !== 'UAH'),
          ]),
        ];
        for (const currency of nbuCurrencies) {
          try {
            fetched.push(
              ...(await this.fetchNbuRates(group, currency, input.signal)),
            );
          } catch (error) {
            if ((error as Error).name === 'AbortError') throw error;
          }
        }
      }
    }
    const rows = fetched.map((row) => ({
      workspaceId: input.workspaceId,
      ...row,
    }));
    if (!rows.length) return 0;
    await this.prisma.exchangeRate.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return rows.length;
  }

  private async fetchFrankfurterRates(
    requestedDates: Date[],
    currencies: string[],
    signal: AbortSignal,
  ) {
    const sorted = [...requestedDates].sort(
      (left, right) => left.getTime() - right.getTime(),
    );
    const start = new Date(sorted[0].getTime() - 7 * 86_400_000);
    const end = sorted.at(-1)!;
    const query = new URLSearchParams({
      base: 'EUR',
      symbols: currencies.join(','),
    });
    const response = await fetch(
      `https://api.frankfurter.dev/v1/${isoDay(start)}..${isoDay(end)}?${query}`,
      { signal },
    );
    if (!response.ok)
      throw new Error(
        `Historical exchange-rate provider returned HTTP ${response.status}`,
      );
    const payload = (await response.json()) as FrankfurterPayload;
    if (payload.base !== 'EUR' || !payload.rates) {
      throw new Error(
        'Historical exchange-rate provider returned an invalid response',
      );
    }

    const observations = Object.entries(payload.rates)
      .map(([date, values]) => ({
        date: new Date(`${date}T00:00:00.000Z`),
        values,
      }))
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const selected = new Map<
      string,
      { date: Date; values: Record<string, number> }
    >();
    for (const requested of sorted) {
      const match = observations.findLast((row) => row.date <= requested);
      if (match) selected.set(isoDay(match.date), match);
    }
    return [...selected.values()].map((row) => ({
      date: row.date,
      values: Object.fromEntries(
        Object.entries(row.values).filter(
          ([, rate]) => Number.isFinite(rate) && rate > 0,
        ),
      ),
    }));
  }

  private async fetchNbuRates(
    requestedDates: Date[],
    currency: string,
    signal: AbortSignal,
  ): Promise<ProviderRateRow[]> {
    const sorted = [...requestedDates].sort(
      (left, right) => left.getTime() - right.getTime(),
    );
    const start = new Date(sorted[0].getTime() - 7 * 86_400_000);
    const end = sorted.at(-1)!;
    const compactDate = (date: Date) => isoDay(date).replaceAll('-', '');
    const query = new URLSearchParams({
      start: compactDate(start),
      end: compactDate(end),
      valcode: currency.toLowerCase(),
      sort: 'exchangedate',
      order: 'asc',
      json: '',
    });
    const response = await fetch(
      `https://bank.gov.ua/NBU_Exchange/exchange_site?${query}`,
      { signal },
    );
    if (!response.ok)
      throw new Error(
        `NBU exchange-rate provider returned HTTP ${response.status}`,
      );
    const payload = (await response.json()) as NbuRate[];
    if (!Array.isArray(payload))
      throw new Error(
        'NBU exchange-rate provider returned an invalid response',
      );
    const observations = payload
      .map((row) => {
        const [day, month, year] = row.exchangedate?.split('.') ?? [];
        const rate =
          row.rate_per_unit ??
          (row.rate && row.units ? row.rate / row.units : undefined);
        return {
          date:
            day && month && year
              ? new Date(`${year}-${month}-${day}T00:00:00.000Z`)
              : null,
          currency: row.cc?.toUpperCase(),
          rate,
        };
      })
      .filter(
        (row): row is { date: Date; currency: string; rate: number } =>
          row.date instanceof Date &&
          !Number.isNaN(row.date.getTime()) &&
          row.currency === currency &&
          typeof row.rate === 'number' &&
          Number.isFinite(row.rate) &&
          row.rate > 0,
      );
    const selected = new Map<string, (typeof observations)[number]>();
    for (const requested of sorted) {
      const match = observations.findLast((row) => row.date <= requested);
      if (match) selected.set(isoDay(match.date), match);
    }
    return [...selected.values()].map((row) => ({
      baseCurrency: row.currency,
      targetCurrency: 'UAH',
      rate: row.rate,
      date: row.date,
      source: 'bank.gov.ua',
    }));
  }
}
