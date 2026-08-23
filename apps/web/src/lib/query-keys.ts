export const authKeys = {
  root: ["auth"] as const,
  me: () => ["auth", "me"] as const,
};

export const workspaceKeys = {
  workspaces: () => ["workspaces"] as const,
  members: () => ["workspace-members"] as const,
  membersSelect: () => ["workspace-members", "select"] as const,
};

export const currencyKeys = {
  settings: () => ["currency-settings"] as const,
  rates: () => ["currency-rates"] as const,
};

export const accountKeys = {
  me: () => ["account-me"] as const,
  accounts: () => ["accounts"] as const,
  transactions: () => ["transactions"] as const,
};

export const dashboardKeys = {
  summary: (
    rangeMode?: string,
    dateFrom?: string | null,
    dateTo?: string | null,
  ) =>
    rangeMode
      ? ([
          "dashboard-summary",
          rangeMode,
          dateFrom ?? null,
          dateTo ?? null,
        ] as const)
      : (["dashboard-summary"] as const),
};

export const telegramChannelKeys = {
  all: ["telegram-channels"] as const,
  root: ["telegram-channels"] as const,
  // Purpose-built read models deliberately have separate key families.
  lists: () => ["telegram-channels", "list"] as const,
  list: (archived?: boolean, owned?: boolean) =>
    ["telegram-channels", "list", archived ?? "all", owned ?? "all"] as const,
  details: () => ["telegram-channels", "detail"] as const,
  select: (params?: { canPostMessagesOnly?: boolean }) =>
    [
      "telegram-channels",
      "select",
      params?.canPostMessagesOnly ?? null,
    ] as const,
  selects: () => ["telegram-channels", "select"] as const,
  detail: (channelId: string) =>
    ["telegram-channels", "detail", channelId] as const,
  analytics: (channelId: string) =>
    ["telegram-channel-analytics", channelId] as const,
  analyticsSources: (channelId?: string) =>
    channelId
      ? (["telegram-channel-analytics-sources", channelId] as const)
      : (["telegram-channel-analytics-sources"] as const),
  audience: (channelId: string) =>
    ["telegram-channel-audience", channelId] as const,
  audienceSnapshots: (channelId: string) =>
    ["telegram-channel-audience-snapshots", channelId] as const,
  financialSummary: (channelId: string) =>
    ["telegram-channel-financial-summary", channelId] as const,
  inviteLinks: (channelId: string) =>
    ["telegram-channel-invite-links", channelId] as const,
  inviteLinksPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) =>
    [
      "telegram-channel-invite-links",
      channelId,
      page,
      pageSize,
      search,
    ] as const,
  sources: () => ["telegram-channel-sources"] as const,
  sourceChannels: () => ["telegram-source-channels"] as const,
  publishingCapabilities: () => ["telegram-publishing-capabilities"] as const,
  customEmojiPacks: (channelId: string) =>
    ["telegram-channel-custom-emoji-packs", channelId] as const,
  campaigns: (channelId: string) =>
    ["telegram-channel-campaigns", channelId] as const,
  campaignsPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) =>
    ["telegram-channel-campaigns", channelId, page, pageSize, search] as const,
};

export const telegramPostKeys = {
  managed: (channelId: string) =>
    ["telegram-managed-posts", channelId] as const,
  managedCalendar: (channelId: string) =>
    ["telegram-managed-posts-calendar", channelId] as const,
  managedHistory: (channelId: string, postId: string) =>
    ["telegram-managed-post-history", channelId, postId] as const,
  plannerFormats: (channelId: string) =>
    ["telegram-managed-posts-calendar-planner-formats", channelId] as const,
  plannerSlots: (channelId: string) =>
    ["telegram-managed-posts-calendar-planner-slots", channelId] as const,
  linkTargets: (channelId: string) =>
    ["telegram-managed-post-link-targets", channelId] as const,
  channelPosts: (channelId: string) =>
    ["telegram-channel-posts", channelId] as const,
  channelPostsPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) => ["telegram-channel-posts", channelId, page, pageSize, search] as const,
  postGroups: (channelId: string) => ["post-groups", channelId] as const,
};

export const telegramAccountKeys = {
  accounts: () => ["telegram-user-accounts"] as const,
  bots: () => ["telegram-bots"] as const,
  botChannels: (botId: string) => ["telegram-bots", botId, "channels"] as const,
};

export const greeterKeys = {
  root: (botId: string) => ["greeter", botId] as const,
  overview: (botId: string) => ["greeter", botId, "overview"] as const,
  users: (botId: string, query: Record<string, unknown>) =>
    ["greeter", botId, "users", query] as const,
  analytics: (botId: string, query: Record<string, unknown>) =>
    ["greeter", botId, "analytics", query] as const,
  sequences: (botId: string) => ["greeter", botId, "sequences"] as const,
  sequence: (botId: string, sequenceId: string) =>
    ["greeter", botId, "sequences", sequenceId] as const,
  sequencePreview: (botId: string, sequenceId: string) =>
    ["greeter", botId, "sequences", sequenceId, "preview"] as const,
  testers: (botId: string, search: string) =>
    ["greeter", botId, "testers", search] as const,
  testMode: (botId: string) => ["greeter", botId, "test-mode"] as const,
  broadcasts: (botId: string) => ["greeter", botId, "broadcasts"] as const,
  broadcast: (botId: string, broadcastId: string) =>
    ["greeter", botId, "broadcasts", broadcastId] as const,
  broadcastEstimate: (botId: string, broadcastId: string) =>
    ["greeter", botId, "broadcasts", broadcastId, "estimate"] as const,
};

export const adCampaignKeys = {
  root: ["ad-campaigns"] as const,
  list: () => ["ad-campaigns"] as const,
  performance: () => ["ad-campaigns-performance"] as const,
  admissionViewAnalytics: (campaignId?: string) =>
    ["ad-campaign-admission-view-analytics", campaignId] as const,
  inviteLinkHistory: (campaignId?: string) =>
    ["campaign-invite-link-history", campaignId] as const,
};

export const networkKeys = {
  list: () => ["telegram-channel-networks"] as const,
  detail: (networkId: string) =>
    ["telegram-channel-network", networkId] as const,
};

export const scheduledTaskKeys = {
  root: ["scheduled-tasks"] as const,
  list: () => ["scheduled-tasks"] as const,
  runs: (taskKey: string) => ["scheduled-tasks", taskKey, "runs"] as const,
};

export const telegramSystemBotKeys = {
  root: ["telegram-system-bot"] as const,
  connection: () => ["telegram-system-bot", "connection"] as const,
  subscriptions: (workspaceId: string) =>
    ["telegram-system-bot", "subscriptions", workspaceId] as const,
  linkPreview: (token: string) =>
    ["telegram-system-bot", "link-preview", token] as const,
};

export const memberKeys = workspaceKeys;

export const botBillingKeys = {
  workspaceProviders: () => ["bot-billing", "workspace", "providers"] as const,
  root: (botId: string) => ["bot-billing", botId] as const,
  overview: (botId: string, environment = "PRODUCTION") =>
    ["bot-billing", botId, "overview", environment] as const,
  analytics: (botId: string) => ["bot-billing", botId, "analytics"] as const,
  plans: (botId: string) => ["bot-billing", botId, "plans"] as const,
  coupons: (botId: string) => ["bot-billing", botId, "coupons"] as const,
  subscribers: (botId: string, filters: Record<string, unknown>) =>
    ["bot-billing", botId, "subscribers", filters] as const,
  users: (botId: string, filters: Record<string, unknown>) =>
    ["bot-billing", botId, "users", filters] as const,
  providers: (botId: string) => ["bot-billing", botId, "providers"] as const,
  financeAi: (botId: string) => ["bot-billing", botId, "finance-ai"] as const,
  workspaceFinanceAi: () => ["bot-billing", "workspace", "finance-ai"] as const,
};
