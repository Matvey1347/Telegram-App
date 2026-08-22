export const consumerFinanceKeys = {
  root: (botId: string) => ["consumer-finance", botId] as const,
  session: (botId: string) => ["consumer-finance", botId, "session"] as const,
  dashboard: (botId: string) =>
    ["consumer-finance", botId, "dashboard"] as const,
  analyticsRoot: (botId: string) =>
    ["consumer-finance", botId, "analytics"] as const,
  analytics: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "analytics", filters] as const,
  ultimateRoot: (botId: string) =>
    ["consumer-finance", botId, "ultimate"] as const,
  ultimateOverview: (botId: string) =>
    ["consumer-finance", botId, "ultimate", "overview"] as const,
  ultimateAnalytics: (botId: string, period: string) =>
    ["consumer-finance", botId, "ultimate", "analytics", period] as const,
  accounts: (botId: string) => ["consumer-finance", botId, "accounts"] as const,
  categories: (botId: string) =>
    ["consumer-finance", botId, "categories"] as const,
  transactions: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "transactions", filters] as const,
  transactionLists: (botId: string) =>
    ["consumer-finance", botId, "transactions"] as const,
  transaction: (botId: string, transactionId: string) =>
    ["consumer-finance", botId, "transaction", transactionId] as const,
  transfers: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "transfers", filters] as const,
  transferLists: (botId: string) =>
    ["consumer-finance", botId, "transfers"] as const,
  limits: (botId: string) => ["consumer-finance", botId, "limits"] as const,
  goal: (botId: string) => ["consumer-finance", botId, "goal"] as const,
  reminders: (botId: string) =>
    ["consumer-finance", botId, "reminders"] as const,
  settings: (botId: string) => ["consumer-finance", botId, "settings"] as const,
  browserLoginConfig: (botId: string) =>
    ["consumer-finance", botId, "browser-login-config"] as const,
  browserLoginChallenge: (botId: string) =>
    ["consumer-finance", botId, "browser-login-challenge"] as const,
  browserLoginApproval: (botId: string, token: string) =>
    ["consumer-finance", botId, "browser-login-approval", token] as const,
  billing: (botId: string) => ["consumer-finance", botId, "billing"] as const,
  entitlements: (botId: string) =>
    ["consumer-finance", botId, "entitlements"] as const,
};
