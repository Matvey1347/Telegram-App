export const AI_CATEGORIES = [
  "SALES_FIRST_DRAFT",
  "SALES_REPLY_SUGGESTION",
  "SALES_FOLLOW_UP",
  "SALES_CONVERSATION_ANALYSIS",
  "LEAD_AD_CLASSIFICATION",
  "LEAD_CONTACT_EXTRACTION",
  "LEAD_QUALIFICATION",
  "SUPPORT_ASSISTANT",
  "TELEGRAM_POSTING_PLAN",
  "TELEGRAM_POSTING_TEXT",
  "TELEGRAM_POSTING_REVIEW",
  "TELEGRAM_POSTING_IMAGE",
] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];
export type AiProvider = "openai";
export type AiPrice = {
  modelId: string;
  provider: AiProvider;
  version: string;
  effectiveAt: string;
  verifiedAt: string;
  currency: "USD";
  inputPerMillion: string;
  cachedInputPerMillion: string;
  cacheWritePerMillion: string | null;
  outputPerMillion: string;
  sourceUrl: string;
};
export type AiCategoryConfiguration = {
  category: AiCategory;
  budgetCategory: AiCategory;
  modelId: string;
  enabled: boolean;
  automaticEnabled: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  concurrencyLimit: number;
  dailyBudget: string | null;
  monthlyBudget: string | null;
  maxRequestCost: string | null;
  schemaId: string;
  promptVersion: string;
  configurationVersion: number;
};
export type AiWorkspaceConfiguration = {
  enabled: boolean;
  automaticEnabled: boolean;
  dailyBudget: string | null;
  monthlyBudget: string | null;
  maxRequestCost: string | null;
  warningPercent: number;
};
export type AiConfiguration = {
  workspaceId: string;
  canConfigure: boolean;
  providerConfigured: boolean;
  deploymentEnabled: boolean;
  currency: "USD";
  settings: AiWorkspaceConfiguration;
  categories: AiCategoryConfiguration[];
  models: AiPrice[];
};
export type AiWorkspaceConfigurationPatch = Partial<AiWorkspaceConfiguration>;
export type AiCategoryConfigurationPatch = Partial<
  Pick<
    AiCategoryConfiguration,
    | "modelId"
    | "enabled"
    | "automaticEnabled"
    | "maxInputTokens"
    | "maxOutputTokens"
    | "timeoutMs"
    | "concurrencyLimit"
    | "dailyBudget"
    | "monthlyBudget"
    | "maxRequestCost"
  >
>;
export type AiReconciliationInput = { actualCost: string; evidence: string };
