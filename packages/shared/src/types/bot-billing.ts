export type BotBillingProvider = "STRIPE" | "TELEGRAM_STARS";
export type BotBillingProviderMode = "TEST" | "LIVE";
export type BotBillingConnectionStatus =
  | "NOT_CONFIGURED"
  | "CONNECTED"
  | "INVALID";
export type BotBillingInterval = "MONTH" | "YEAR";
export type BotSubscriptionSource =
  | "STRIPE"
  | "TELEGRAM_STARS"
  | "MANUAL"
  | "GIFT";
export type BotSubscriptionStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "INCOMPLETE";

export type BotBillingProviderCapabilities = {
  recurring: boolean;
  intervals: BotBillingInterval[];
  currencies?: string[];
  coupons: boolean;
  refunds: boolean;
};

export type BotBillingProviderConfigView = {
  provider: BotBillingProvider;
  mode: BotBillingProviderMode;
  status: BotBillingConnectionStatus;
  source: "WORKSPACE_DEFAULT" | "BOT_OVERRIDE" | "NONE";
  publicKeyConfigured: boolean;
  publicKeyMasked?: string | null;
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  lastCheckedAt?: string | null;
  lastValidationError?: string | null;
  capabilities: BotBillingProviderCapabilities;
};

export type FinanceAiConfigView = {
  provider: "OPENAI";
  model: string;
  source: "WORKSPACE_DEFAULT" | "BOT_OVERRIDE" | "NONE";
  status: "NOT_CONFIGURED" | "CONNECTED" | "INVALID";
  apiKeyConfigured: boolean;
  lastCheckedAt: string | null;
  lastValidationError: string | null;
};

export type BotBillingOverviewView = {
  analytics: BotBillingAnalyticsView & { conversionRate: number };
  recentActivity: Array<{
    id: string;
    type: "SUBSCRIPTION" | "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED";
    occurredAt: string;
    subscriptionId: string | null;
    amountMinor: number | null;
    currency: string | null;
    subscriber: { id: string; telegramUserId: string; username: string | null; firstName: string | null } | null;
    plan: { id: string; name: string } | null;
  }>;
};

export type BotBillingSubscriberPage = {
  items: Array<{
    id: string;
    user: { id: string; telegramUserId: string; username: string | null; firstName: string | null };
    plan: { id: string; name: string } | null;
    amountMinor: number | null;
    currency: string | null;
    interval: BotBillingInterval | null;
    source: BotSubscriptionSource;
    provider: BotBillingProvider | null;
    status: BotSubscriptionStatus;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
  }>;
  nextCursor: string | null;
};

export type BotBillingUserPage = {
  items: Array<{
    id: string;
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
    environment: "LOCAL" | "PRODUCTION";
    firstSeenAt: string;
    lastInteractionAt: string;
    profile: { id: string; locale: string; defaultCurrency: string; timezone: string; onboardingCompleted: boolean } | null;
    subscription: { id: string; status: BotSubscriptionStatus; source: BotSubscriptionSource; currentPeriodEnd: string | null; plan: { id: string; name: string; code: string } | null } | null;
  }>;
  nextCursor: string | null;
};

export type BotBillingEntitlements = {
  botIntegrationId: string;
  telegramBotUserId: string;
  capabilities: string[];
  hasPaidEntitlement: boolean;
  activeUntil?: string | null;
};

export type BotBillingAnalyticsView = {
  registeredUsers: number;
  activeSubscriptions: number;
  freeUsers: number;
  paidUsers: number;
  canceled: number;
  failedPayments: number;
  monthly: number;
  yearly: number;
  mrr: Array<{ currency: string; amountMinor: number }>;
  collectedRevenue: Array<{
    currency: string | null;
    amountMinor: number;
  }>;
};
