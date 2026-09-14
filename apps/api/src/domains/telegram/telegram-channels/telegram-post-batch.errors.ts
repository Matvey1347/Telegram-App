import { ConflictException, NotFoundException } from '@nestjs/common';
import { telegramPostsBadRequest } from './telegram-posts.errors';

export const postBatchNotFound = () =>
  new NotFoundException('Telegram post batch not found');

export const postBatchConflict = () =>
  new ConflictException('Telegram post batch changed or is no longer editable');

export const postBatchLimitExceeded = (message: string) =>
  telegramPostsBadRequest('TELEGRAM_POST_BATCH_LIMIT_EXCEEDED', message);

export const postBatchInvalid = (message: string) =>
  telegramPostsBadRequest('TELEGRAM_POST_INVALID_SCHEDULE', message);
