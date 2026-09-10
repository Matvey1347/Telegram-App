export const consumerFinanceKeys = {
  root: (botId: string) => ["consumer-finance", botId] as const,
  session: (botId: string) => ["consumer-finance", botId, "session"] as const,
  dashboard: (botId: string) =>
    ["consumer-finance", botId, "dashboard"] as const,
  analyticsRoot: (botId: string) =>
    ["consumer-finance", botId, "analytics"] as const,
  analytics: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "analytics", filters] as const,
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
  debtsRoot: (botId: string) => ["consumer-finance", botId, "debts"] as const,
  debts: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "debts", filters] as const,
  regularPaymentsRoot: (botId: string) =>
    ["consumer-finance", botId, "regular-payments"] as const,
  regularPayments: (botId: string, filters: Record<string, unknown>) =>
    ["consumer-finance", botId, "regular-payments", filters] as const,
  regularPaymentRevisions: (botId: string, regularPaymentId: string) =>
    [
      "consumer-finance",
      botId,
      "regular-payments",
      regularPaymentId,
      "revisions",
    ] as const,
  limits: (botId: string) => ["consumer-finance", botId, "limits"] as const,
  smartLimits: (botId: string) =>
    ["consumer-finance", botId, "limits", "smart"] as const,
  savingsGoals: (botId: string, filters: Record<string, unknown> = {}) =>
    ["consumer-finance", botId, "savings-goals", filters] as const,
  savingsGoalLists: (botId: string) =>
    ["consumer-finance", botId, "savings-goals"] as const,
  savingsGoal: (botId: string, goalId: string) =>
    ["consumer-finance", botId, "savings-goal", goalId] as const,
  savingsHistory: (botId: string, goalId: string) =>
    ["consumer-finance", botId, "savings-goal", goalId, "history"] as const,
  investmentLists: (botId: string) =>
    ["consumer-finance", botId, "investments"] as const,
  investments: (botId: string, filters: Record<string, unknown> = {}) =>
    ["consumer-finance", botId, "investments", filters] as const,
  investment: (botId: string, investmentId: string) =>
    ["consumer-finance", botId, "investment", investmentId] as const,
  investmentCashFlows: (botId: string, investmentId: string) =>
    [
      "consumer-finance",
      botId,
      "investment",
      investmentId,
      "cash-flows",
    ] as const,
  investmentValuations: (botId: string, investmentId: string) =>
    [
      "consumer-finance",
      botId,
      "investment",
      investmentId,
      "valuations",
    ] as const,
  investmentSummary: (botId: string) =>
    ["consumer-finance", botId, "investment-summary"] as const,
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
