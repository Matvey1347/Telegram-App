import type { PaginatedResponse } from "../pagination";

export type GreeterCaptchaType = "BUTTON_CONFIRM" | "SIMPLE_CHOICE";
export type GreeterFailureBehavior = "KEEP_PENDING" | "DECLINE";
export type GreeterConfigSource = "GLOBAL" | "OVERRIDE";
export type GreeterUserState = "ALIVE" | "BLOCKED" | "DID_NOT_INTERACT";
export type GreeterCaptchaStatus =
  | "PENDING"
  | "PASSED"
  | "FAILED"
  | "APPROVED"
  | "DECLINED"
  | "EXPIRED";

export type GreeterButton = { text: string; url: string };
export type GreeterButtonRows = GreeterButton[][];

export type GreeterConfigInput = {
  captchaEnabled: boolean;
  captchaType: GreeterCaptchaType;
  captchaMessage: string;
  confirmButtonText: string;
  choicePrompt: string;
  timeoutMinutes: number;
  successMessage: string | null;
  failureMessage: string | null;
  failureBehavior: GreeterFailureBehavior;
};

export type GreeterConfigView = GreeterConfigInput & {
  source: GreeterConfigSource;
};

export type GreeterChannelOverrideInput = Partial<GreeterConfigInput> & {
  enabled?: boolean;
  useGlobalConfig: boolean;
};

export type GreeterChannelView = {
  id: string;
  channel: { id: string; title: string; username: string | null };
  enabled: boolean;
  useGlobalConfig: boolean;
  publishedUseGlobalConfig: boolean;
  permissionHealth: {
    status: "CONNECTED" | "MISSING_PERMISSIONS" | "UNKNOWN" | "ERROR";
    canInviteUsers: boolean;
    missingPermissions: string[];
    lastCheckedAt: string | null;
    error: string | null;
  };
  override: Partial<GreeterConfigInput>;
  effectiveConfig: GreeterConfigView;
  publishedOverride: Partial<GreeterConfigInput>;
  publishedEffectiveConfig: GreeterConfigView;
};

export type GreeterOverview = {
  bot: {
    id: string;
    label: string;
    username: string | null;
    applicationType: string;
    runtimeStatus: string;
    webhookStatus: string;
    lastRuntimeError: string | null;
  };
  config: GreeterConfigView;
  publishedConfig: GreeterConfigView;
  configuration: {
    draftRevision: number;
    publishedRevision: number;
    publishedAt: string | null;
    hasUnpublishedChanges: boolean;
  };
  channels: GreeterChannelView[];
  metrics: {
    acquired: number;
    alive: number;
    blocked: number;
    didNotInteract: number;
    approved: number;
  };
};

export type GreeterUserView = {
  id: string;
  telegramUserId: string;
  displayName: string;
  username: string | null;
  channel: { id: string; title: string; username: string | null };
  firstSeenAt: string;
  joinRequestedAt: string;
  captchaStatus: GreeterCaptchaStatus;
  approvedAt: string | null;
  state: GreeterUserState;
  blockedAt: string | null;
  lastInteractionAt: string;
};

export type GreeterUsersQuery = {
  page?: number;
  pageSize?: number;
  channelId?: string;
  captchaStatus?: GreeterCaptchaStatus;
  state?: GreeterUserState;
  search?: string;
};

export type GreeterUsersResponse = PaginatedResponse<GreeterUserView>;

export type GreeterAnalyticsQuery = {
  from?: string;
  to?: string;
  channelId?: string;
};

export type GreeterAnalytics = {
  range: { from: string | null; to: string | null; channelId: string | null };
  metrics: {
    growth: number;
    alive: number;
    blocked: number;
    didNotInteract: number;
    joinRequests: number;
    captchaStarted: number;
    captchaPassed: number;
    captchaFailed: number;
    captchaPassRate: number;
    approved: number;
    interactionRate: number;
  };
  trends: Array<{
    date: string;
    acquired: number;
    captchaStarted: number;
    captchaPassed: number;
  }>;
};

export type GreeterTemplateContextInput = {
  channelId?: string;
  telegramBotUserId?: string;
  sample?: {
    channelTitle?: string;
    channelUsername?: string;
    firstName?: string;
    username?: string;
  };
};

export type GreeterTemplatePreview = {
  renderedText: string;
  buttons: GreeterButtonRows;
  variables: Record<string, string>;
};

export type GreeterSequenceTrigger = "AFTER_START" | "AFTER_CAPTCHA_SUCCESS";
export type GreeterAutomationEnvironment = "PRODUCTION" | "TEST";

export type GreeterSequenceStepInput = {
  position: number;
  delaySeconds: number;
  enabled: boolean;
  messageText: string;
  buttons: GreeterButtonRows;
};

export type GreeterSequenceStepView = GreeterSequenceStepInput & { id: string };

export type GreeterSequenceSummary = {
  id: string;
  name: string;
  trigger: GreeterSequenceTrigger;
  scope: {
    type: "GLOBAL" | "CHANNEL";
    channel: { id: string; title: string; username: string | null } | null;
  };
  enabled: boolean;
  draftRevision: number;
  draftStepCount: number;
  currentVersion: { id: string; version: number; publishedAt: string } | null;
  updatedAt: string;
};

export type GreeterSequenceDetail = GreeterSequenceSummary & {
  draftSteps: GreeterSequenceStepView[];
  versions: Array<{
    id: string;
    version: number;
    publishedAt: string;
    stepCount: number;
  }>;
  testSession: GreeterTestSessionView | null;
};

export type GreeterSequenceVersionView = {
  id: string;
  sequenceId: string;
  version: number;
  publishedAt: string;
  steps: GreeterSequenceStepView[];
};

export type GreeterTestSessionView = {
  enabled: boolean;
  tester: { id: string; displayName: string; username: string | null } | null;
  channel: { id: string; title: string; username: string | null } | null;
  generation: number;
  startedAt: string | null;
  lastInteractionAt: string | null;
  enabledAt: string | null;
  disabledAt: string | null;
};

export type GreeterTestModeEnableInput = {
  telegramBotUserId: string;
  channelId?: string | null;
};

export type GreeterTestModeResolveInput = { username: string };

export type GreeterTesterLookup = {
  id: string;
  displayName: string;
  username: string | null;
  telegramUserId: string;
};

export type GreeterBroadcastAudience = "ALL_ALIVE" | "CHANNEL" | "USER_STATE";
export type GreeterBroadcastStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIALLY_FAILED"
  | "FAILED"
  | "CANCELLED";

export type GreeterBroadcastInput = {
  name: string;
  messageText: string;
  buttons: GreeterButtonRows;
  audience: GreeterBroadcastAudience;
  channelId?: string | null;
  userState?: GreeterUserState | null;
};

export type GreeterBroadcastProgress = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  blocked: number;
};

export type GreeterBroadcastView = GreeterBroadcastInput & {
  id: string;
  status: GreeterBroadcastStatus;
  channel: { id: string; title: string; username: string | null } | null;
  scheduledAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  progress: GreeterBroadcastProgress;
  createdAt: string;
  updatedAt: string;
};

export type GreeterBroadcastEstimate = {
  recipients: number;
  audience: GreeterBroadcastAudience;
  channel: { id: string; title: string; username: string | null } | null;
};
