import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_CURRENT_RATE_AGE_MS = 48 * 60 * 60 * 1000;
export type CurrencyRateResult =
  | { available: true; rate: number; rateAt: Date; stale: false }
  | {
      available: false;
      code: 'RATE_UNAVAILABLE' | 'RATE_STALE';
      message: string;
      rateAt?: Date;
    };

/** Resolves one bounded, in-memory graph from persisted workspace rates. */
@Injectable()
export class CurrencyConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async getRateMetadata(
    fromCurrency: string,
    toCurrency: string,
    workspaceId: string,
    date?: Date,
  ): Promise<CurrencyRateResult> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to)
      return {
        available: true,
        rate: 1,
        rateAt: date || new Date(),
        stale: false,
      };
    const rows = await this.prisma.exchangeRate.findMany({
      where: { workspaceId, ...(date ? { date: { lte: date } } : {}) },
      select: {
        baseCurrency: true,
        targetCurrency: true,
        rate: true,
        date: true,
      },
      orderBy: { date: 'desc' },
    });
    const edges = new Map<string, { rate: number; date: Date }>();
    for (const row of rows) {
      const key = `${row.baseCurrency}:${row.targetCurrency}`;
      if (!edges.has(key) && Number(row.rate) > 0)
        edges.set(key, { rate: Number(row.rate), date: row.date });
    }
    const graph = new Map<
      string,
      Array<{ to: string; rate: number; date: Date }>
    >();
    for (const [key, value] of edges) {
      const [base, target] = key.split(':');
      const add = (a: string, b: string, rate: number) =>
        graph.set(a, [
          ...(graph.get(a) || []),
          { to: b, rate, date: value.date },
        ]);
      add(base, target, value.rate);
      add(target, base, 1 / value.rate);
    }
    const queue: Array<{ currency: string; rate: number; oldest: Date }> = [
      { currency: from, rate: 1, oldest: new Date(8640000000000000) },
    ];
    const seen = new Set<string>([from]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of graph.get(current.currency) || []) {
        if (seen.has(edge.to)) continue;
        const oldest = edge.date < current.oldest ? edge.date : current.oldest;
        if (edge.to === to) {
          if (!date && Date.now() - oldest.getTime() > MAX_CURRENT_RATE_AGE_MS)
            return {
              available: false,
              code: 'RATE_STALE',
              message:
                'The available exchange rate is too old. Please try again later.',
              rateAt: oldest,
            };
          return {
            available: true,
            rate: current.rate * edge.rate,
            rateAt: oldest,
            stale: false,
          };
        }
        seen.add(edge.to);
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
