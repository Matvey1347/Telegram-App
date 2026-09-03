import { Prisma } from '@prisma/client';
import type { CrmMessage } from '@telegram-system/shared';

export const crmMessageSelect = {
  id: true,
  workspaceId: true,
  conversationId: true,
  telegramMessageId: true,
  telegramMessageIdNumeric: true,
  clientIdempotencyKey: true,
  mtprotoAccountId: true,
  direction: true,
  origin: true,
  sentByMemberId: true,
  text: true,
  contentMetadata: true,
  sentAt: true,
  editedAt: true,
  readState: true,
  deliveryState: true,
  createdAt: true,
} satisfies Prisma.TelegramCrmMessageSelect;

export type CrmMessageRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmMessageSelect;
}>;

export function mapCrmMessage(row: CrmMessageRow): CrmMessage {
  return {
    ...row,
    contentMetadata:
      row.contentMetadata &&
      typeof row.contentMetadata === 'object' &&
      !Array.isArray(row.contentMetadata)
        ? row.contentMetadata
        : null,
    sentAt: row.sentAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
