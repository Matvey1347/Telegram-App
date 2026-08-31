export type TelegramWorkspaceSyncSelection = {
  syncIncludePublicInfo: boolean;
  syncIncludeInviteLinks: boolean;
  syncIncludeHistoricalPosts: boolean;
  syncIncludePostMetrics: boolean;
  syncIncludeOlderPosts: boolean;
  syncIncludeChannelStats: boolean;
  syncIncludeManagedPosts: boolean;
  syncIncludeAudienceSnapshot: boolean;
};

export type TelegramWorkspaceManualSyncRequest = {
  selection: TelegramWorkspaceSyncSelection;
};

export type TelegramWorkspaceFullSyncResult = {
  workspaceName: string;
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  durationMs: number;
  summary: string;
  failures: Array<{
    channelId: string;
    channelTitle: string;
    reason: string;
  }>;
};
