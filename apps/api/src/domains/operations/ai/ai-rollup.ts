import { Prisma, type AiOperation } from '@prisma/client';
import { budgetPeriods } from './ai-pricing';

/** Called only in the same locked settlement transaction as the operation change. */
export async function writeAiRollup(
  tx: Prisma.TransactionClient,
  operation: AiOperation,
  direction: 1 | -1 = 1,
) {
  const dimensions = {
    workspaceId: operation.workspaceId,
    day: budgetPeriods(operation.createdAt)[0].periodStart,
    category: operation.category,
    provider: operation.provider,
    model: operation.model,
    status: operation.status,
    aiPostingChannelId: operation.aiPostingChannelId ?? '',
    aiPostingPublicationKey:
      (operation.aiPostingTestRunId ?? operation.aiPostingAutopilotRunId) &&
      operation.aiPostingPublicationIndex !== null
        ? `${operation.aiPostingTestRunId ?? operation.aiPostingAutopilotRunId}:${operation.aiPostingPublicationIndex}`
        : '',
    aiPostingMode: operation.aiPostingMode ?? 'NONE',
  };
  const counters = {
    requests: direction,
    errors:
      (operation.status === 'FAILED' || operation.status === 'UNKNOWN'
        ? 1
        : 0) * direction,
    pricedRequests: (operation.actualCost !== null ? 1 : 0) * direction,
    unpricedRequests:
      (['UNKNOWN', 'UNPRICED'].includes(operation.pricingStatus) ? 1 : 0) *
      direction,
    unknownUsageRequests:
      (operation.pricingStatus !== 'NOT_SENT' &&
      (operation.inputTokens === null || operation.outputTokens === null)
        ? 1
        : 0) * direction,
    knownCost: (operation.actualCost ?? new Prisma.Decimal(0)).mul(direction),
    inputTokens: BigInt(operation.inputTokens ?? 0) * BigInt(direction),
    outputTokens: BigInt(operation.outputTokens ?? 0) * BigInt(direction),
    cachedInputTokens:
      BigInt(operation.cachedInputTokens ?? 0) * BigInt(direction),
    cacheWriteTokens:
      BigInt(operation.cacheWriteTokens ?? 0) * BigInt(direction),
    reasoningTokens: BigInt(operation.reasoningTokens ?? 0) * BigInt(direction),
    totalTokens: BigInt(operation.totalTokens ?? 0) * BigInt(direction),
  };
  const where = {
    workspaceId_day_category_provider_model_status_aiPostingChannelId_aiPostingPublicationKey_aiPostingMode:
      dimensions,
  };
  const update = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, { increment: value }]),
  );
  // PostgreSQL validates the INSERT side of an upsert before resolving its
  // conflict. A negative create therefore violates the nonnegative checks.
  if (direction === -1) {
    await tx.aiUsageDaily.update({ where, data: update });
    return;
  }
  await tx.aiUsageDaily.upsert({
    where,
    create: { ...dimensions, ...counters },
    update,
  });
}

export async function settleAiBuckets(
  tx: Prisma.TransactionClient,
  operation: AiOperation,
  actualCost: Prisma.Decimal | null,
) {
  const scopes = [
    'WORKSPACE',
    operation.category,
    ...(operation.aiPostingChannelId
      ? [`TELEGRAM_CHANNEL:${operation.aiPostingChannelId}`]
      : []),
  ];
  for (const scope of scopes)
    for (const period of budgetPeriods(operation.createdAt)) {
      await tx.aiBudgetPeriod.update({
        where: {
          workspaceId_scope_period_periodStart: {
            workspaceId: operation.workspaceId,
            scope,
            period: period.period,
            periodStart: period.periodStart,
          },
        },
        data: {
          reserved: { decrement: operation.reservedCost },
          ...(actualCost !== null ? { spent: { increment: actualCost } } : {}),
        },
      });
    }
}
