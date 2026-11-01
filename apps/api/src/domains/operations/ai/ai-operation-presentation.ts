import type { AiOperation, Prisma } from '@prisma/client';
import type { AiOperationView } from '@telegram-system/shared';

export const aiOperationPresentationSelect = {
  id: true,
  operationId: true,
  workspaceId: true,
  category: true,
  provider: true,
  model: true,
  providerModel: true,
  createdAt: true,
  finishedAt: true,
  status: true,
  deadlineAt: true,
  pricingStatus: true,
  actualCost: true,
  reservedCost: true,
  inputTokens: true,
  outputTokens: true,
  cachedInputTokens: true,
  cacheWriteTokens: true,
  reasoningTokens: true,
  totalTokens: true,
  durationMs: true,
  errorCategory: true,
  pricingVersion: true,
  pricingEffectiveAt: true,
  businessObjectId: true,
} satisfies Prisma.AiOperationSelect;
export type AiOperationPresentationRow = Pick<
  AiOperation,
  keyof typeof aiOperationPresentationSelect
>;

/** Public ledger projection. Prompts, actor identifiers and provider metadata stay private. */
export function mapAiOperationView(
  row: AiOperationPresentationRow,
  now = new Date(),
): AiOperationView {
  return {
    id: row.id,
    operationId: row.operationId,
    workspaceId: row.workspaceId,
    category: row.category as AiOperationView['category'],
    provider: row.provider as AiOperationView['provider'],
    model: row.model,
    providerModel: row.providerModel,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    status:
      row.status === 'RUNNING' && row.deadlineAt <= now
        ? 'UNKNOWN'
        : (row.status as AiOperationView['status']),
    pricingStatus: row.pricingStatus as AiOperationView['pricingStatus'],
    actualCost: row.actualCost?.toFixed(12) ?? null,
    reservedCost: row.reservedCost.toFixed(12),
    currency: 'USD',
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedInputTokens: row.cachedInputTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    reasoningTokens: row.reasoningTokens,
    totalTokens: row.totalTokens,
    durationMs: row.durationMs,
    errorCategory: row.errorCategory,
    pricingVersion: row.pricingVersion,
    pricingEffectiveAt: row.pricingEffectiveAt?.toISOString() ?? null,
    businessObjectId: row.businessObjectId,
  };
}
