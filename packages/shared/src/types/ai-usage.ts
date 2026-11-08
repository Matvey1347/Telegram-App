import type { AiCategory, AiProvider } from "./ai-configuration";
export const AI_OPERATION_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN", "RECONCILED"] as const;
export type AiOperationStatus = (typeof AI_OPERATION_STATUSES)[number];
export type AiPricingStatus = "PRICED" | "UNKNOWN" | "UNPRICED" | "NOT_SENT" | "MANUAL";
export type AiUsageFilter = {
  from?: string; to?: string; category?: AiCategory; model?: string; provider?: AiProvider;
  unresolved?: boolean;
  status?: AiOperationStatus; scope?: "ALL" | "SALES"; workspaceId?: string;
};
export type AiTokenUsage = {
  inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
  cacheWriteTokens: number | null; reasoningTokens: number | null; totalTokens: number | null;
};
export type AiOperationView = AiTokenUsage & {
  id: string; operationId: string; workspaceId: string; category: AiCategory; provider: AiProvider;
  model: string; providerModel: string | null; createdAt: string; finishedAt: string | null;
  status: AiOperationStatus; pricingStatus: AiPricingStatus; actualCost: string | null;
  reservedCost: string; currency: "USD"; durationMs: number | null; errorCategory: string | null;
  pricingVersion: string | null; pricingEffectiveAt: string | null; businessObjectId: string | null;
  aiPostingChannelId: string | null; aiPostingTestRunId: string | null;
  aiPostingAutopilotRunId: string | null; aiPostingPublicationIndex: number | null;
  aiPostingAttempt: number | null; aiPostingMode: "TEST" | "AUTOMATIC" | null;
  aiPostingManagedPostId: string | null;
};
export type AiUsageTotals = {
  requests: number; errors: number; knownCost: string; pricedRequests: number; unpricedRequests: number;
  unknownUsageRequests: number; averageKnownCost: string | null;
  inputTokens: string; outputTokens: string; cachedInputTokens: string; cacheWriteTokens: string;
  reasoningTokens: string; totalTokens: string;
};
export type AiBudgetBalance = {
  scope: "WORKSPACE" | AiCategory; period: "DAY" | "MONTH"; periodStart: string; periodEnd: string;
  limit: string | null; spent: string; reserved: string; remaining: string | null; warning: boolean; exhausted: boolean;
};
export type AiUsageDashboard = {
  workspaceId: string; currency: "USD"; from: string; to: string; asOf: string;
  summary: { today: AiUsageTotals; sevenDays: AiUsageTotals; thirtyDays: AiUsageTotals; month: AiUsageTotals; selected: AiUsageTotals };
  timeline: Array<{ date: string } & AiUsageTotals>;
  byFeature: Array<{ category: AiCategory } & AiUsageTotals>;
  byModel: Array<{ model: string; provider: AiProvider } & AiUsageTotals>;
  budgets: AiBudgetBalance[]; pendingRequests: number; unresolvedRequests: number;
};
export type AiOperationsPage = { items: AiOperationView[]; nextCursor: string | null; hasMore: boolean };

/** Operation history only; aggregate cubes retain canonical financial categories. */
export type AiOperationsFilter = AiUsageFilter & { businessScope?: "ALL" | "CANDIDATE_FIRST_OFFER" };
