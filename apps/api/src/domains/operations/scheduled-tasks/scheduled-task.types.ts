import type {
  ScheduledTaskFrequency,
  ScheduledTaskGroup,
  ScheduledTaskSchedule,
  ScheduledTaskScope,
} from '@telegram-system/shared';

export type ScheduledTaskExecutionContext = {
  taskKey: string;
  workspaceId: string | null;
  trigger: 'SCHEDULE' | 'MANUAL';
};

export type ScheduledTaskExecutionResult = {
  summary?: string | null;
  skipped?: boolean;
  details?: unknown;
};

export type ScheduledTaskDefinition = {
  key: string;
  name: string;
  description: string;
  scope: ScheduledTaskScope;
  defaultSchedule: ScheduledTaskSchedule;
  scheduleEditable: boolean;
  supportedFrequencies: ScheduledTaskFrequency[];
  notificationSupported: boolean;
  group?: ScheduledTaskGroup;
  /** A one-shot task whose next occurrence is derived from persisted domain work. */
  dueDriven?: boolean;
  execute: (
    context: ScheduledTaskExecutionContext,
  ) => Promise<ScheduledTaskExecutionResult | void>;
};

export type ScheduledTaskConfigShape = {
  enabled: boolean;
  schedule: ScheduledTaskSchedule;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notificationChannel: 'SYSTEM_TELEGRAM_BOT';
};
