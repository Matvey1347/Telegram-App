export const CRM_CUSTOMER_AUTOMATION_TYPES = [
  "PRE_PUBLICATION_REMINDER",
  "PUBLISHED_LINKS",
  "FOLLOW_UP",
] as const;
export type CrmCustomerAutomationType =
  (typeof CRM_CUSTOMER_AUTOMATION_TYPES)[number];

export const CRM_AUTOMATION_OVERRIDES = [
  "INHERIT",
  "ENABLED",
  "DISABLED",
] as const;
export type CrmAutomationOverride = (typeof CRM_AUTOMATION_OVERRIDES)[number];

export const CRM_AUTOMATION_LOCALES = ["en", "ru", "uk"] as const;
export type CrmAutomationLocale = (typeof CRM_AUTOMATION_LOCALES)[number];

export type CrmAutomationExecutionStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENDING"
  | "SENT"
  | "SKIPPED"
  | "FAILED"
  | "CANCELLED";

export type CrmAutomationEligibilityReason =
  | "ELIGIBLE"
  | "WORKSPACE_DISABLED"
  | "WORKSPACE_TYPE_DISABLED"
  | "CONTACT_DISABLED"
  | "CONTACT_TYPE_DISABLED"
  | "DEAL_DISABLED"
  | "DEAL_TYPE_DISABLED"
  | "DEAL_NOT_ELIGIBLE"
  | "DEAL_CANCELLED"
  | "BEFORE_CUTOVER"
  | "HISTORICAL_EVENT"
  | "INVALID_CONTACT"
  | "INVALID_CONVERSATION"
  | "ACCOUNT_DISABLED"
  | "TEMPLATE_UNAVAILABLE"
  | "MISSING_IDEMPOTENCY_KEY";

export type CrmAutomationEligibility = {
  allowed: boolean;
  reason: CrmAutomationEligibilityReason;
};

export type CrmAutomationTypeActivation = {
  enabled: boolean;
  enabledAt: string | null;
};

export type CrmAutomationTypeOverride = {
  override: CrmAutomationOverride;
  enabledAt: string | null;
};

export type CrmWorkspaceAutomationSettings = {
  customerTelegramAutomationsEnabled: boolean;
  customerTelegramAutomationsEnabledAt: string | null;
  locale: CrmAutomationLocale;
  /** Compatibility projection retained for existing Stage 3 clients. */
  typeEnabled: Record<CrmCustomerAutomationType, boolean>;
  typeSettings: Record<CrmCustomerAutomationType, CrmAutomationTypeActivation>;
};

export type CrmWorkspaceSettings = {
  workspaceId: string;
  defaultCrmSenderAccountId: string | null;
  automation: CrmWorkspaceAutomationSettings;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CrmContactAutomationSettings = {
  contactId: string;
  enabled: boolean;
  enabledAt: string | null;
  locale: CrmAutomationLocale | null;
  typeOverrides: Record<CrmCustomerAutomationType, CrmAutomationTypeOverride>;
};

export type CrmAutomationExecutionSummary = {
  id: string;
  automationType: CrmCustomerAutomationType;
  status: CrmAutomationExecutionStatus;
  eventOccurredAt: string;
  dueAt: string | null;
  attempts: number;
  maxAttempts: number;
  templateKey: string | null;
  locale: CrmAutomationLocale | null;
  reason: string | null;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type CrmDealAutomationSummary = {
  dealId: string;
  override: CrmAutomationOverride;
  eligibleAt: string | null;
};

export type CrmDealAutomationUpdateResult = CrmDealAutomationSummary;

export type CrmDealAutomationStatus = CrmDealAutomationSummary & {
  conversationId: string | null;
  typeOverrides: Record<CrmCustomerAutomationType, CrmAutomationTypeOverride>;
  customerFollowUp: { dueAt: string; version: number } | null;
  latestExecutions: CrmAutomationExecutionSummary[];
  evaluated: Record<CrmCustomerAutomationType, CrmAutomationEligibility>;
};

export type CrmAutomationStatusResponse = {
  workspace: CrmWorkspaceAutomationSettings;
  contact: CrmContactAutomationSettings;
  deals: CrmDealAutomationStatus[];
};

export type UpdateCrmContactAutomationPayload = {
  enabled?: boolean;
  locale?: CrmAutomationLocale | null;
  typeOverrides?: Partial<
    Record<CrmCustomerAutomationType, CrmAutomationOverride>
  >;
};

export type UpdateCrmDealAutomationPayload = {
  override?: CrmAutomationOverride;
  conversationId?: string | null;
  typeOverrides?: Partial<
    Record<CrmCustomerAutomationType, CrmAutomationOverride>
  >;
};

export type UpdateCrmCustomerFollowUpPayload = { dueAt: string | null };
