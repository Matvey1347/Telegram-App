import { Prisma } from '@prisma/client';
import type { AiPrice, AiTokenUsage } from '@telegram-system/shared';

export function aiRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const EMPTY_USAGE: AiTokenUsage = {
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  cacheWriteTokens: null,
  reasoningTokens: null,
  totalTokens: null,
};
export function parseUsage(raw: unknown): AiTokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const inputDetails = aiRecord(u.input_tokens_details);
  const outputDetails = aiRecord(u.output_tokens_details);
  const tokenCount = (value: unknown, fallback?: number) => {
    if (value === undefined && fallback !== undefined) return fallback;
    return typeof value === 'number' && Number.isSafeInteger(value) &&
      value >= 0 && value <= 2147483647 ? value : null;
  };
  const inputTokens = tokenCount(u.input_tokens);
  const outputTokens = tokenCount(u.output_tokens);
  const cachedInputTokens = tokenCount(inputDetails.cached_tokens, 0);
  const cacheWriteTokens = tokenCount(inputDetails.cache_write_tokens, 0);
  const reasoningTokens = tokenCount(outputDetails.reasoning_tokens, 0);
  const reportedTotal = tokenCount(u.total_tokens);
  if (
    inputTokens === null || outputTokens === null ||
    cachedInputTokens === null || cacheWriteTokens === null ||
    reasoningTokens === null ||
    (u.total_tokens !== undefined && reportedTotal === null)
  ) return null;
  const totalTokens = reportedTotal ?? inputTokens + outputTokens;
  if (
    cachedInputTokens + cacheWriteTokens > inputTokens ||
    reasoningTokens > outputTokens ||
    totalTokens !== inputTokens + outputTokens
  )
    return null;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
  };
}
export function priceUsage(
  price: AiPrice,
  usage: AiTokenUsage,
): Prisma.Decimal | null {
  if (
    usage.inputTokens === null ||
    usage.outputTokens === null ||
    usage.cachedInputTokens === null ||
    usage.cacheWriteTokens === null
  )
    return null;
  if (usage.cacheWriteTokens && price.cacheWritePerMillion === null)
    return null;
  return new Prisma.Decimal(
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
  )
    .mul(price.inputPerMillion)
    .add(
      new Prisma.Decimal(usage.cachedInputTokens).mul(
        price.cachedInputPerMillion,
      ),
    )
    .add(
      new Prisma.Decimal(usage.cacheWriteTokens).mul(
        price.cacheWritePerMillion ?? '0',
      ),
    )
    .add(new Prisma.Decimal(usage.outputTokens).mul(price.outputPerMillion))
    .div(1000000)
    .toDecimalPlaces(12, Prisma.Decimal.ROUND_UP);
}
export function reservationCost(
  price: AiPrice,
  input: number,
  output: number,
): Prisma.Decimal {
  const rate = Prisma.Decimal.max(
    price.inputPerMillion,
    price.cachedInputPerMillion,
    price.cacheWritePerMillion ?? '0',
  );
  return rate
    .mul(input)
    .add(new Prisma.Decimal(price.outputPerMillion).mul(output))
    .div(1000000)
    .toDecimalPlaces(12, Prisma.Decimal.ROUND_UP);
}
export function budgetPeriods(now: Date) {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return [
    {
      period: 'DAY',
      periodStart: day,
      periodEnd: new Date(day.getTime() + 86400000),
    },
    {
      period: 'MONTH',
      periodStart: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      periodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      ),
    },
  ];
}
