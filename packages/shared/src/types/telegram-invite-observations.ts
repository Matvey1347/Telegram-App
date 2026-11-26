export type TelegramInviteCounterObservation = {
  joinedObserved?: boolean | null;
  requestedObserved?: boolean | null;
  joinedObservedAt?: string | null;
  requestedObservedAt?: string | null;
};

export type CampaignInviteRule = {
  fromDate?: string | null;
  /** Use the full current Telegram queue, independently of the join date filter. */
  currentRequests?: boolean;
};
export type CampaignInviteWindow = CampaignInviteRule & {
  inviteLinkId: string;
  fromDate: string | null;
  joinedCount?: number | null;
  pendingCount?: number | null;
  peakPendingCount?: number | null;
  computedAt?: string | null;
  lastAttemptAt?: string | null;
  lastAttemptStatus?: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | null;
  lastAttemptReason?: string | null;
};
