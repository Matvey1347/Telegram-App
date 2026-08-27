import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
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
  private readonly logger = new Logger(
    TelegramSystemBotPostContentService.name,
  );

  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly media: TelegramManagedPostMediaStorageService,
  ) {}

  async capture(message: TelegramSystemBotIncomingMessage) {
    const parsed = parseTelegramSystemBotForwardedContent(message);
    if (!parsed.ok) return parsed;
    let imageUrls: string[] = [];
    try {
      imageUrls = parsed.content.photo
        ? [await this.persistPhoto(parsed.content.photo.fileId)]
        : [];
    } catch (error) {
      this.logger.warn(
        `System Bot post photo import failed: ${sanitizeOperationalError(error)}`,
      );
      return {
        ok: false as const,
        reason: 'PHOTO_IMPORT_FAILED' as const,
        unsupportedMedia: [],
        warnings: parsed.warnings,
      };
    }
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
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const file = await this.api.getFile(this.config.token!, fileId);
        if ((file.file_size ?? 0) > MAX_TELEGRAM_IMAGE_BYTES) {
          throw new BadRequestException('Telegram photo exceeds 10 MB');
        }
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
        if (!url)
          throw new NotFoundException('Telegram photo could not be stored');
        return url;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
