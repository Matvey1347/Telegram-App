export type TelegramInviteCounterObservation = {
  joinedObserved?: boolean | null;
  requestedObserved?: boolean | null;
  joinedObservedAt?: string | null;
  requestedObservedAt?: string | null;
};

export type CampaignInviteWindow = {
  inviteLinkId: string;
  fromDate: string;
  joinedCount?: number | null;
  pendingCount?: number | null;
  computedAt?: string | null;
  lastAttemptAt?: string | null;
  lastAttemptStatus?: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | null;
  lastAttemptReason?: string | null;
};
