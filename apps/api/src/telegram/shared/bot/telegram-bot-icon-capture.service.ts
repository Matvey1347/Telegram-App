import { Injectable } from '@nestjs/common';
import { B2ObjectStorageService } from '../../common/object-storage/b2-object-storage.service';
import { TelegramBotApiClient } from './telegram-bot-api.client';
import {
  TELEGRAM_BOT_IMAGE_ICON_PREFIX,
  telegramIconSourceFromText,
} from './telegram-bot-icon-source';

export {
  storedTelegramIconPresentation,
  telegramIconSourceFromText,
} from './telegram-bot-icon-source';

const MAX_ICON_BYTES = 5 * 1024 * 1024;

export type TelegramBotIconMessage = {
  text?: string;
  entities?: unknown[];
  photo?: Array<{ file_id?: string; file_size?: number }>;
  document?: {
    file_id?: string;
    file_size?: number;
    mime_type?: string;
  };
};

@Injectable()
export class TelegramBotIconCaptureService {
  constructor(
    private readonly botApi: TelegramBotApiClient,
    private readonly storage: B2ObjectStorageService,
  ) {}

  text(message: TelegramBotIconMessage) {
    return telegramIconSourceFromText(message);
  }

  async media(token: string, message: TelegramBotIconMessage) {
    const photo = [...(message.photo ?? [])]
      .filter((item) => item.file_id)
      .sort((left, right) => (right.file_size ?? 0) - (left.file_size ?? 0))[0];
    const document = message.document;
    const candidate = photo?.file_id
      ? { fileId: photo.file_id, size: photo.file_size, mimeType: 'image/jpeg' }
      : document?.file_id && document.mime_type?.startsWith('image/')
        ? {
            fileId: document.file_id,
            size: document.file_size,
            mimeType: document.mime_type,
          }
        : null;
    if (!candidate || (candidate.size ?? 0) > MAX_ICON_BYTES) return null;
    const file = await this.botApi.getFile(token, candidate.fileId);
    if (!file.file_path) return null;
    const downloaded = await this.botApi.downloadFile(
      token,
      file.file_path,
      MAX_ICON_BYTES,
    );
    const mimeType = (candidate.mimeType || downloaded.contentType)
      .split(';', 1)[0]
      .toLowerCase();
    const stored = await this.storage.persistImmutableImages([
      { bytes: downloaded.bytes, mimeType },
    ]);
    return stored.urls[0]
      ? `${TELEGRAM_BOT_IMAGE_ICON_PREFIX}${stored.urls[0]}`
      : null;
  }
}
