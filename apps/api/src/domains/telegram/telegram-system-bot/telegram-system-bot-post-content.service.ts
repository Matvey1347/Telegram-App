import { Injectable, NotFoundException } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramManagedPostMediaStorageService } from '../telegram-channels/telegram-managed-post-media-storage.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import {
  parseTelegramSystemBotForwardedContent,
  type TelegramSystemBotIncomingMessage,
} from './telegram-system-bot-forwarded-content.parser';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

const MAX_TELEGRAM_IMAGE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class TelegramSystemBotPostContentService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly media: TelegramManagedPostMediaStorageService,
  ) {}

  async capture(message: TelegramSystemBotIncomingMessage) {
    const parsed = parseTelegramSystemBotForwardedContent(message);
    if (!parsed.ok) return parsed;
    const imageUrls = parsed.content.photo
      ? [await this.persistPhoto(parsed.content.photo.fileId)]
      : [];
    return {
      ok: true as const,
      content: {
        text: parsed.content.managedText,
        imageUrls,
        buttonRows: parsed.content.buttonRows,
        mediaGroupId: parsed.content.mediaGroupId,
        sourceTitle: parsed.content.forward?.sourceChatTitle ?? null,
        warnings: parsed.warnings,
      } satisfies TelegramSystemBotCapturedPostContent,
    };
  }

  async removeInput(chatId: string, messageId: number | undefined) {
    if (!messageId) return;
    await this.api
      .deleteMessage(this.config.token!, {
        chat_id: chatId,
        message_id: messageId,
      })
      .catch(() => undefined);
  }

  private async persistPhoto(fileId: string) {
    const file = await this.api.getFile(this.config.token!, fileId);
    if (!file.file_path)
      throw new NotFoundException('Telegram photo is unavailable');
    const downloaded = await this.api.downloadFile(
      this.config.token!,
      file.file_path,
      MAX_TELEGRAM_IMAGE_BYTES,
    );
    const [url] = await this.media.persistImageBytes([
      { bytes: downloaded.bytes, contentType: downloaded.contentType },
    ]);
    if (!url) throw new NotFoundException('Telegram photo could not be stored');
    return url;
  }
}
