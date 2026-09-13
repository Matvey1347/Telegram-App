import type { Prisma } from '@prisma/client';
import type { TelegramPostMediaItem } from '@telegram-system/shared';
import type { TelegramSystemBotWorkflowStore } from './telegram-system-bot-workflow.store';

export type TelegramSystemBotPostAction = 'DRAFT' | 'PUBLISH_NOW' | 'SCHEDULE';

export type TelegramSystemBotPostPreviewDraft = {
  text?: string;
  imageUrls?: string[];
  mediaItems?: TelegramPostMediaItem[];
  buttonRows?: Array<
    Array<{
      text?: string;
      url?: string;
      style?: 'default' | 'primary' | 'success' | 'danger';
    }>
  >;
};

export type TelegramSystemBotCapturedPostContent = {
  text: string;
  plainText?: string;
  formattedHtml?: string;
  imageUrls: string[];
  mediaItems?: TelegramPostMediaItem[];
  buttonRows: Array<
    Array<{
      text: string;
      url: string;
      style: 'default' | 'primary' | 'success' | 'danger';
    }>
  >;
  mediaGroupId: string | null;
  sourceTitle: string | null;
  warnings: string[];
};

export type TelegramSystemBotPostPayload = {
  destination?: 'MANAGED_POST' | 'AD_SALE_MODAL';
  content?: TelegramSystemBotCapturedPostContent;
  channelId?: string;
  channelTitle?: string;
  groupId?: string;
  groupTitle?: string;
  action?: TelegramSystemBotPostAction;
  scheduledAt?: string;
};

export type TelegramSystemBotPostGroupOption = {
  id: string;
  title: string;
  isDefault: boolean;
};

export type TelegramSystemBotPostFlowScope = {
  connectionId: string;
  workspaceId: string;
  userId: string;
  telegramUserId: string;
  chatId: string;
  timezone: string;
  locale?: import('@telegram-system/shared').AppLocale;
};

export type TelegramSystemBotPostWorkflow = Awaited<
  ReturnType<TelegramSystemBotWorkflowStore['get']>
>;

export function telegramSystemBotPostPayload(
  value: Prisma.JsonValue,
): TelegramSystemBotPostPayload {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export function telegramSystemBotPostJson(value: TelegramSystemBotPostPayload) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
