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

const MAX_TELEGRAM_MEDIA_BYTES = 20 * 1024 * 1024;

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
    let mediaItems: TelegramSystemBotCapturedPostContent['mediaItems'] = [];
    try {
      mediaItems = parsed.content.media
        ? [
            {
              ...(await this.persistMedia(parsed.content.media)),
              sourceMessageId: parsed.content.telegramMessageId,
            },
          ]
        : [];
    } catch (error) {
      this.logger.warn(
        `System Bot post media import failed: ${sanitizeOperationalError(error)}`,
      );
      return {
        ok: false as const,
        reason: 'MEDIA_IMPORT_FAILED' as const,
        unsupportedMedia: [],
        warnings: parsed.warnings,
      };
    }
    return {
      ok: true as const,
      content: {
        text: parsed.content.managedText,
        plainText: parsed.content.text,
        formattedHtml: parsed.content.formattedHtml,
        imageUrls: mediaItems
          .filter((item) => item.kind === 'PHOTO')
          .map((item) => item.url),
        mediaItems,
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

  private async persistMedia(
    media: NonNullable<
      Extract<
        ReturnType<typeof parseTelegramSystemBotForwardedContent>,
        { ok: true }
      >['content']['media']
    >,
  ) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const file = await this.api.getFile(this.config.token!, media.fileId);
        if ((file.file_size ?? 0) > MAX_TELEGRAM_MEDIA_BYTES) {
          throw new BadRequestException('Telegram media exceeds 20 MB');
        }
        if (!file.file_path)
          throw new NotFoundException('Telegram photo is unavailable');
        const downloaded = await this.api.downloadFile(
          this.config.token!,
          file.file_path,
          MAX_TELEGRAM_MEDIA_BYTES,
        );
        if (media.kind === 'PHOTO') {
          const [url] = await this.media.persistImageBytes([
            {
              bytes: downloaded.bytes,
              contentType: media.mimeType ?? downloaded.contentType,
            },
          ]);
          if (!url)
            throw new NotFoundException('Telegram photo could not be stored');
          return {
            kind: 'PHOTO' as const,
            url,
            width: media.width,
            height: media.height,
          };
        }
        return await this.media.persistMediaBytes({
          bytes: downloaded.bytes,
          kind: media.kind,
          contentType: media.mimeType ?? downloaded.contentType,
          fileName: media.fileName,
          width: media.width,
          height: media.height,
          durationSeconds: media.durationSeconds,
        });
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
