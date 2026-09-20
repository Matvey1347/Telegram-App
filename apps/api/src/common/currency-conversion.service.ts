import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HistoricalExchangeRateService } from './historical-exchange-rate.service';

const MAX_CURRENT_RATE_AGE_MS = 48 * 60 * 60 * 1000;
type CurrencyRateRow = {
  baseCurrency: string;
  targetCurrency: string;
  rate: unknown;
  date: Date;
};

type DatedCurrencyRateRow = CurrencyRateRow & { asOf: Date };

export type CurrencyRateResult =
  | { available: true; rate: number; rateAt: Date; stale: false }
  | {
      available: false;
      code: 'RATE_UNAVAILABLE' | 'RATE_STALE';
      message: string;
      rateAt?: Date;
    };

export type PreparedCurrencyRateSource = {
  getRateMetadata: (
    fromCurrency: string,
    toCurrency: string,
  ) => Promise<CurrencyRateResult>;
  getRate: (fromCurrency: string, toCurrency: string) => Promise<number | null>;
  convertCurrency: (
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ) => Promise<number | null>;
};

type CurrencyRateGraph = Map<
  string,
  Array<{ to: string; rate: number; date: Date }>
>;

function buildRateGraph(rows: CurrencyRateRow[]): CurrencyRateGraph {
  const edges = new Map<string, { rate: number; date: Date }>();
  for (const row of rows) {
    const key = `${row.baseCurrency}:${row.targetCurrency}`;
    if (!edges.has(key) && Number(row.rate) > 0) {
      edges.set(key, { rate: Number(row.rate), date: row.date });
    }
  }

  const graph: CurrencyRateGraph = new Map();
  for (const [key, value] of edges) {
    const [base, target] = key.split(':');
    const add = (from: string, to: string, rate: number) =>
      graph.set(from, [
        ...(graph.get(from) || []),
        { to, rate, date: value.date },
      ]);
    add(base, target, value.rate);
    add(target, base, 1 / value.rate);
  }
  return graph;
}

function resolveRateMetadata(
  graph: CurrencyRateGraph,
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
): CurrencyRateResult {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return {
      available: true,
      rate: 1,
      rateAt: date || new Date(),
      stale: false,
    };
  }

  const queue: Array<{ currency: string; rate: number; oldest: Date }> = [
    { currency: from, rate: 1, oldest: new Date(8640000000000000) },
  ];
  const freshestPath = new Map<string, number>([[from, Infinity]]);
  while (queue.length) {
    queue.sort((left, right) => right.oldest.getTime() - left.oldest.getTime());
    const current = queue.shift()!;
    if (current.currency === to) {
      if (
        !date &&
        Date.now() - current.oldest.getTime() > MAX_CURRENT_RATE_AGE_MS
      ) {
        return {
          available: false,
          code: 'RATE_STALE',
          message:
            'The available exchange rate is too old. Please try again later.',
          rateAt: current.oldest,
        };
      }
      return {
        available: true,
        rate: current.rate,
        rateAt: current.oldest,
        stale: false,
      };
    }
    for (const edge of graph.get(current.currency) || []) {
      const oldest = edge.date < current.oldest ? edge.date : current.oldest;
      const freshness = oldest.getTime();
      if (freshness <= (freshestPath.get(edge.to) ?? -Infinity)) continue;
      freshestPath.set(edge.to, freshness);
      queue.push({
        currency: edge.to,
        rate: current.rate * edge.rate,
        oldest,
      });
    }
  }
  return {
    available: false,
    code: 'RATE_UNAVAILABLE',
    message: `No exchange rate is available for ${from} to ${to}.`,
  };
}

function preparedRateSource(
  rows: CurrencyRateRow[],
  date?: Date,
): PreparedCurrencyRateSource {
  const graph = buildRateGraph(rows);
  const getRateMetadata = (fromCurrency: string, toCurrency: string) =>
    Promise.resolve(resolveRateMetadata(graph, fromCurrency, toCurrency, date));
  const getRate = async (fromCurrency: string, toCurrency: string) => {
    const result = await getRateMetadata(fromCurrency, toCurrency);
    return result.available ? result.rate : null;
  };
  return {
    getRateMetadata,
    getRate,
    convertCurrency: async (amount, fromCurrency, toCurrency) => {
      const rate = await getRate(fromCurrency, toCurrency);
      return rate == null ? null : amount * rate;
    },
  };
}

/** Resolves one bounded, in-memory graph from persisted workspace rates. */
@Injectable()
export class CurrencyConversionService {
  private readonly currentRefreshes = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalRates?: HistoricalExchangeRateService,
  ) {}

  /** Loads one workspace graph for repeated conversions in a single use case. */
  async prepareRateSource(
    workspaceId: string,
    date?: Date,
  ): Promise<PreparedCurrencyRateSource> {
    // One latest row per directed pair bounds memory by the configured
    // currency graph rather than by the workspace's full rate history.
    const loadRows = () =>
      this.prisma.$queryRaw<CurrencyRateRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("baseCurrency", "targetCurrency")
        "baseCurrency", "targetCurrency", "rate", "date"
      FROM "ExchangeRate"
      WHERE ${date ? Prisma.sql`"date" <= ${date}` : Prisma.sql`TRUE`}
      ORDER BY "baseCurrency", "targetCurrency", "date" DESC
    `);
    let source = preparedRateSource(await loadRows(), date);
    if (date || !this.externalRates) return source;

    const attemptedPairs = new Set<string>();
    const getRateMetadata = async (
      fromCurrency: string,
      toCurrency: string,
    ) => {
      let result = await source.getRateMetadata(fromCurrency, toCurrency);
      if (result.available) return result;
      const pair = [fromCurrency.toUpperCase(), toCurrency.toUpperCase()]
        .sort()
        .join(':');
      if (attemptedPairs.has(pair)) return result;
      attemptedPairs.add(pair);
      try {
        await this.refreshCurrentPair(workspaceId, pair.split(':'));
        source = preparedRateSource(await loadRows());
        result = await source.getRateMetadata(fromCurrency, toCurrency);
      } catch {
        // Preserve the original structured RATE_STALE/RATE_UNAVAILABLE result
        // when every live provider is temporarily unavailable.
      }
      return result;
    };
    const getRate = async (fromCurrency: string, toCurrency: string) => {
      const result = await getRateMetadata(fromCurrency, toCurrency);
      return result.available ? result.rate : null;
    };
    return {
      getRateMetadata,
      getRate,
      convertCurrency: async (amount, fromCurrency, toCurrency) => {
        const rate = await getRate(fromCurrency, toCurrency);
        return rate == null ? null : amount * rate;
      },
    };
  }

  private async refreshCurrentPair(workspaceId: string, currencies: string[]) {
    const key = currencies.join(':');
    const existing = this.currentRefreshes.get(key);
    if (existing) return existing;
    const refresh = this.externalRates!.ensureCurrentRates({
      currencies,
      signal: AbortSignal.timeout(8_000),
    })
      .then(() => undefined)
      .finally(() => this.currentRefreshes.delete(key));
    this.currentRefreshes.set(key, refresh);
    return refresh;
  }

  /** Loads all requested historical graphs in one bounded database round-trip. */
  async prepareHistoricalRateSources(workspaceId: string, dates: Date[]) {
    const unique = [
      ...new Map(dates.map((date) => [date.toISOString(), date])).values(),
    ];
    if (!unique.length) return new Map<string, PreparedCurrencyRateSource>();
    // PostgreSQL cannot infer the VALUES column type through Prisma's bound
    // parameters here and otherwise treats it as text.
    const values = Prisma.join(
      unique.map((date) => Prisma.sql`(CAST(${date} AS TIMESTAMP))`),
    );
    const rows = await this.prisma.$queryRaw<DatedCurrencyRateRow[]>(Prisma.sql`
      WITH requested("asOf") AS (VALUES ${values})
      SELECT
        requested."asOf",
        rate."baseCurrency",
        rate."targetCurrency",
        rate."rate",
        rate."date"
      FROM requested
      CROSS JOIN LATERAL (
        SELECT DISTINCT ON ("baseCurrency", "targetCurrency")
          "baseCurrency", "targetCurrency", "rate", "date"
        FROM "ExchangeRate"
        WHERE "date" <= requested."asOf"
        ORDER BY "baseCurrency", "targetCurrency", "date" DESC
      ) AS rate
    `);
    const grouped = new Map<string, CurrencyRateRow[]>();
    for (const row of rows) {
      const key = row.asOf.toISOString();
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return new Map(
      unique.map((date) => [
        date.toISOString(),
        preparedRateSource(grouped.get(date.toISOString()) ?? [], date),
      ]),
    );
  }

  async getRateMetadata(
    fromCurrency: string,
    toCurrency: string,
    workspaceId: string,
    date?: Date,
  ): Promise<CurrencyRateResult> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) return resolveRateMetadata(new Map(), from, to, date);
    const source = await this.prepareRateSource(workspaceId, date);
    return source.getRateMetadata(from, to);
  }

  async getRate(
    from: string,
    to: string,
    workspaceId: string,
    date?: Date,
  ): Promise<number | null> {
    const result = await this.getRateMetadata(from, to, workspaceId, date);
    return result.available ? result.rate : null;
  }
  async convertCurrency(
    amount: number,
    from: string,
    to: string,
    workspaceId: string,
    date?: Date,
  ): Promise<number | null> {
    const rate = await this.getRate(from, to, workspaceId, date);
    return rate == null ? null : amount * rate;
  }
}
