import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AI_CATEGORIES,
  AI_OPERATION_STATUSES,
  type AiUsageFilter,
  type AiUsageTotals,
} from '@telegram-system/shared';

const CostDecimal = Prisma.Decimal.clone({ precision: 50 });

export const DAY_MS = 86_400_000;
export const utcDay = (date: Date) => new Date(date.toISOString().slice(0, 10));
export type UsageRange = { from: Date; end: Date; to: string };
export function usageRange(query: AiUsageFilter, now: Date): UsageRange {
  const today = utcDay(now);
  const parse = (value: string) => {
    const date = new Date(value);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Invalid AI usage date');
    return date;
  };
  const to = query.to ? parse(query.to) : today;
  const from = query.from
    ? parse(query.from)
    : new Date(to.getTime() - 29 * DAY_MS);
  if (
    from > to ||
    to > today ||
    from.getTime() < today.getTime() - 89 * DAY_MS ||
    to.getTime() - from.getTime() >= 90 * DAY_MS
  )
    throw new BadRequestException(
      'AI usage dates must be within the last 90 UTC days',
    );
  return {
    from,
    end: new Date(to.getTime() + DAY_MS),
    to: to.toISOString().slice(0, 10),
  };
}
export function validateUsageFilters(query: AiUsageFilter, models: string[]) {
  if (
    (query.category && !AI_CATEGORIES.includes(query.category)) ||
    (query.status && !AI_OPERATION_STATUSES.includes(query.status)) ||
    (query.provider && query.provider !== 'openai') ||
    (query.model && !models.includes(query.model)) ||
    (query.scope && !['ALL', 'SALES'].includes(query.scope))
  )
    throw new BadRequestException('Invalid AI usage filter');
}
export function dimensionFilter(query: AiUsageFilter): Prisma.Sql {
  return Prisma.sql`${query.category ? Prisma.sql`AND "category" = ${query.category}` : Prisma.empty}
    ${query.scope === 'SALES' ? Prisma.sql`AND "category" IN (${Prisma.join(AI_CATEGORIES.filter((c) => c.startsWith('SALES_')))})` : Prisma.empty}
    ${query.model ? Prisma.sql`AND "model" = ${query.model}` : Prisma.empty}
    ${query.provider ? Prisma.sql`AND "provider" = ${query.provider}` : Prisma.empty}`;
}
export function operationStatusFilter(
  status: AiUsageFilter['status'],
  now: Date,
): Prisma.Sql {
  if (status === 'UNKNOWN')
    return Prisma.sql`AND ("status" = 'UNKNOWN' OR ("status" = 'RUNNING' AND "deadlineAt" <= ${now}))`;
  if (status === 'RUNNING')
    return Prisma.sql`AND "status" = 'RUNNING' AND "deadlineAt" > ${now}`;
  return status ? Prisma.sql`AND "status" = ${status}` : Prisma.empty;
}
export const COUNTERS = [
  'requests',
  'errors',
  'pricedRequests',
  'unpricedRequests',
  'unknownUsageRequests',
] as const;
export const TOKENS = [
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'totalTokens',
] as const;
export type TotalRow = Record<
  (typeof COUNTERS)[number] | (typeof TOKENS)[number] | 'knownCost',
  string | bigint | number | Prisma.Decimal
>;
export function usageTotals(row?: TotalRow): AiUsageTotals {
  const value = (key: keyof TotalRow) => String(row?.[key] ?? 0);
  const knownCost = new CostDecimal(value('knownCost'));
  const pricedRequests = Number(value('pricedRequests'));
  return {
    ...Object.fromEntries(COUNTERS.map((key) => [key, Number(value(key))])),
    ...Object.fromEntries(TOKENS.map((key) => [key, value(key)])),
    knownCost: knownCost.toFixed(12),
    averageKnownCost: pricedRequests
      ? knownCost.div(pricedRequests).toFixed(12)
      : null,
  } as AiUsageTotals;
}
export type OperationCursor = {
  v: 1;
  kind: 'ai-operations';
  at: string;
  id: string;
};
export function decodeOperationCursor(value?: string): OperationCursor | null {
  if (!value) return null;
  try {
    if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const cursor = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as OperationCursor;
    if (
      cursor.v !== 1 ||
      cursor.kind !== 'ai-operations' ||
      typeof cursor.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(cursor.id) ||
      typeof cursor.at !== 'string' ||
      new Date(cursor.at).toISOString() !== cursor.at
    )
      throw new Error();
    return cursor;
  } catch {
    throw new BadRequestException('Invalid AI operations cursor');
  }
}
