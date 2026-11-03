import type {
  TelegramPostsErrorCode,
  TranslationParams,
} from '@telegram-system/shared';
import {
  badRequest,
  notFound,
} from '../../../common/http/structured-http-error';

export function telegramPostsBadRequest(
  code: TelegramPostsErrorCode,
  message: string,
  params?: TranslationParams,
) {
  return badRequest(code, message, params);
}

export function telegramPostsNotFound(
  code: TelegramPostsErrorCode,
  message: string,
  params?: TranslationParams,
) {
  return notFound(code, message, params);
}

export function telegramPostPublishErrorCode(message: string): TelegramPostsErrorCode {
  return /Could not download image \d+/.test(message)
    ? 'TELEGRAM_POST_IMAGE_UNAVAILABLE'
    : 'TELEGRAM_POST_PUBLISH_FAILED';
}

export const telegramChannelNotFound = () =>
  telegramPostsNotFound(
    'TELEGRAM_CHANNEL_NOT_FOUND',
    'Telegram channel not found',
  );

export const managedPostNotFound = () =>
  telegramPostsNotFound(
    'TELEGRAM_MANAGED_POST_NOT_FOUND',
    'Managed post not found',
  );

export const postGroupNotFound = () =>
  telegramPostsNotFound(
    'TELEGRAM_POST_GROUP_NOT_FOUND',
    'Post group not found',
  );
