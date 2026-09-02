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
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientMemberId: row.recipientMemberId,
    type: row.type,
    priority: row.priority,
    copyKey: row.copyKey as OperationsNotificationCopyKey,
    title: row.title,
    body: row.body,
    metadata: metadata(row.metadata),
    targetUrl: requireInternalNotificationTarget(row.targetUrl),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}
