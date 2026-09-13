import type { OperationsNotification } from '@prisma/client';
import type {
  OperationsNotificationCopyKey,
  OperationsNotificationItem,
  OperationsNotificationMetadata,
} from '@telegram-system/shared';
import { requireInternalNotificationTarget } from './operations-notification-target';

function metadata(value: unknown): OperationsNotificationMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    ),
  );
}

export function mapOperationsNotification(
  row: OperationsNotification,
): OperationsNotificationItem {
  const normalizedMetadata = metadata(row.metadata);
  const presentation = crmMessagePresentation(row, normalizedMetadata);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientMemberId: row.recipientMemberId,
    type: row.type,
    priority: row.priority,
    copyKey: row.copyKey as OperationsNotificationCopyKey,
    title: row.title,
    body: row.body,
    metadata: normalizedMetadata,
    presentation,
    targetUrl: requireInternalNotificationTarget(row.targetUrl),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function crmMessagePresentation(
  row: OperationsNotification,
  value: OperationsNotificationMetadata,
): OperationsNotificationItem['presentation'] {
  if (
    row.type !== 'CRM_MESSAGE_RECEIVED' ||
    value.presentationKind !== 'crm-message' ||
    typeof value.conversationId !== 'string' ||
    typeof value.senderName !== 'string' ||
    typeof value.messageCount !== 'number'
  ) {
    return null;
  }
  return {
    kind: 'crm-message',
    conversationId: value.conversationId,
    contactId: typeof value.contactId === 'string' ? value.contactId : null,
    senderName: value.senderName,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    messageCount: value.messageCount,
    notificationIds:
      typeof value.notificationIds === 'string'
        ? value.notificationIds.split(',').filter(Boolean)
        : [row.id],
  };
}
