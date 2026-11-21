import { Api } from 'telegram';
import type { TelegramInviteLinksResult } from './telegram-invite-links.types';
import { type ResolvedTelegramEntity } from '@api/telegram/shared/imports/telegram-import.helpers';
import type { TelegramChannelSyncProgressItem } from '@telegram-system/shared';

export type ApiCredentials = { apiId: string; apiHash: string };

export type SessionParams = ApiCredentials & { session?: string };

export type ImportableTelegramEntity = Api.User | Api.Channel | Api.Chat;

export type TelegramChannelAccessMode =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'PRIVATE_INVITE'
  | 'PRIVATE_JOIN_REQUEST'
  | 'UNKNOWN';

export type StoredTelegramChannelReference = {
  username?: string | null;
  telegramChatId?: string | null;
  inviteLink?: string | null;
  telegramAccessHash?: string | null;
};

export type ResolvedStoredTelegramChannel = {
  entity: ImportableTelegramEntity;
  peer: Api.TypeInputPeer;
  channel: ResolvedTelegramEntity & {
    telegramAccessHash: string | null;
    accessMode: TelegramChannelAccessMode;
    requiresJoinRequest: boolean;
    inviteLink: string | null;
    resolvedBy: 'dialog-id' | 'stored-peer' | 'username' | 'invite-link';
  };
};

export type TelegramScheduledMessage = {
  id: string;
  text: string;
  html: string;
  date: string | null;
  hasMedia: boolean;
  mediaKind: string | null;
  groupedId: string | null;
};

export type TelegramManagedPostHistory = {
  published: Array<TelegramScheduledMessage & { isScheduled: boolean }>;
  recentPublishedComplete: boolean;
  recentPublished: Array<TelegramScheduledMessage & { isScheduled: boolean }>;
  scheduled: Array<TelegramScheduledMessage & { isScheduled: boolean }>;
};

export type ResolvedTelegramCustomEmojiPack = {
  shortName: string;
  title: string;
  telegramSetId: string | null;
  documents: Array<{
    documentId: string;
    alt: string;
    mimeType: string | null;
    kind: 'STATIC' | 'ANIMATED' | 'VIDEO';
    isFree: boolean;
    needsRepainting: boolean;
    originalAsset: Buffer | null;
  }>;
};

export type InviteAdminSummary = TelegramInviteLinksResult['admins'][number];

export type ExportedInvitePayload = {
  link?: unknown;
  adminId?: unknown;
  title?: unknown;
  date?: unknown;
  startDate?: unknown;
  expireDate?: unknown;
  usageLimit?: unknown;
  usage?: unknown;
  requested?: unknown;
  requestNeeded?: unknown;
  permanent?: unknown;
  revoked?: unknown;
  invite?: unknown;
  newInvite?: unknown;
};

export type InviteLinksProgressCallback = (
  item: TelegramChannelSyncProgressItem,
) => void | Promise<void>;

export type InviteLinkLoadedCallback = (
  link: TelegramInviteLinksResult['links'][number],
  loadedCount: number,
  expectedTotal: number,
  warnings: string[],
) => void | Promise<void>;

export const DEFAULT_MT_PROTO_CAPTION_LIMIT = 1024;

export const PREMIUM_MT_PROTO_CAPTION_LIMIT = 4096;

export const DEFAULT_TELEGRAM_MESSAGE_LIMIT = 4096;

export type TelegramLongLike =
  | bigint
  | number
  | string
  | {
      toString(): string;
      constructor?: { name?: string };
    };
