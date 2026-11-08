import type { OperationsNotification, Prisma } from '@prisma/client';
import { operationsNotificationMemberSelect } from './operations-notification-permission.service';
import { OPERATIONS_PUSH_MAX_ACTIVE_DEVICES } from './operations-notification-policy';
import { requireInternalNotificationTarget } from './operations-notification-target';

export const OPERATIONS_PUSH_MAX_GROUPS = 100;
export const OPERATIONS_PUSH_QUEUE_LIMIT =
  OPERATIONS_PUSH_MAX_GROUPS * OPERATIONS_PUSH_MAX_ACTIVE_DEVICES;
export const OPERATIONS_PUSH_CONCURRENCY = 8;
export const OPERATIONS_PUSH_MAX_QUEUE_AGE_MS = 30_000;
// Push is useful for a short event window, not a delayed message archive.
export const OPERATIONS_PUSH_TTL_SECONDS = 300;
export const OPERATIONS_PUSH_TIMEOUT_MS = 10_000;

export const notificationRecipientSelect = {
  ...operationsNotificationMemberSelect,
  operationsNotificationPreference: {
    select: {
      webPushEnabled: true,
      crmNotificationsEnabled: true,
      crmIncomingMessagesEnabled: true,
      crmFollowUpEnabled: true,
      crmAiLeadsEnabled: true,
      crmMessagePreviewEnabled: true,
      channelRemindersPushEnabled: true,
    },
  },
} satisfies Prisma.WorkspaceMemberSelect;

export const pushRecipientSelect = {
  ...notificationRecipientSelect,
  user: {
    select: {
      operationsPushSubscriptions: {
        where: { active: true },
        orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
        take: OPERATIONS_PUSH_MAX_ACTIVE_DEVICES,
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      },
    },
  },
} satisfies Prisma.WorkspaceMemberSelect;

export type OperationsPushRow = Prisma.OperationsNotificationGetPayload<{
  include: { recipient: { select: typeof pushRecipientSelect } };
}>;

type PushPreference = Prisma.OperationsNotificationPreferenceGetPayload<{
  select: typeof pushRecipientSelect.operationsNotificationPreference.select;
}>;

export function pushPreferenceAllows(
  type: OperationsNotification['type'],
  preference: PushPreference | null,
  metadata?: Prisma.JsonValue | null,
) {
  return (
    Boolean(preference?.webPushEnabled) &&
    (type !== 'AI_POSTING_AUTOPILOT' ||
      (metadata !== null &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        metadata.pwaPushEnabled !== false)) &&
    (type !== 'CHANNEL_POSTS_REMINDER' ||
      Boolean(preference?.channelRemindersPushEnabled)) &&
    notificationPreferenceAllows(type, preference, metadata)
  );
}

export function notificationPreferenceAllows(
  type: OperationsNotification['type'],
  preference: PushPreference | null,
  metadata?: Prisma.JsonValue | null,
) {
  if (
    type === 'AI_POSTING_AUTOPILOT' &&
    metadata !== null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    metadata.pwaPushEnabled === false
  )
    return false;
  if (!type.startsWith('CRM_')) return true;
  if (!(preference?.crmNotificationsEnabled ?? true)) return false;
  if (type === 'CRM_MESSAGE_RECEIVED')
    return preference?.crmIncomingMessagesEnabled ?? false;
  if (type === 'CRM_FOLLOW_UP_DUE')
    return preference?.crmFollowUpEnabled ?? true;
  if (type === 'CRM_AI_LEAD_QUALIFIED')
    return preference?.crmAiLeadsEnabled ?? false;
  return true;
}

export function pushPayload(
  row: OperationsNotification,
  preference: PushPreference | null,
) {
  const preview =
    row.type.startsWith('CRM_') &&
    (preference?.crmMessagePreviewEnabled ?? false);
  const clean = (value: string, limit: number) =>
    value.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  return JSON.stringify({
    id: row.id,
    title:
      row.type === 'SYSTEM_TEST' || preview
        ? clean(row.title, 160)
        : row.type.startsWith('CRM_')
          ? 'New CRM activity'
          : 'New workspace activity',
    body:
      preview || row.type === 'SYSTEM_TEST'
        ? clean(row.body, 240)
        : 'Open Nexeloq to review the update.',
    targetUrl: requireInternalNotificationTarget(row.targetUrl),
  });
}
