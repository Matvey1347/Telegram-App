import { Injectable } from '@nestjs/common';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';

@Injectable()
export class TelegramSystemBotNotificationAvatarService {
  private readonly cache = new Map<string, { expires: number; value: string | null }>();
  constructor(private readonly api: TelegramBotApiClient, private readonly config: TelegramSystemBotConfigService) {}

  async get(kind: 'user' | 'group', id: string | null): Promise<string | null> {
    if (!id || !this.config.token) return null;
    const key = `${kind}:${id}`;
    const existing = this.cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    let value: string | null = null;
    try {
      const token = this.config.token;
      const fileId = kind === 'user'
        ? (await this.api.getUserProfilePhotos(token, id)).photos?.[0]?.[0]?.file_id
        : (await this.api.getChat(token, id)).photo?.small_file_id;
      if (fileId) {
        const file = await this.api.getFile(token, fileId);
        if (file.file_path) {
          const image = await this.api.downloadFile(token, file.file_path, 256 * 1024);
          const mime = image.contentType.startsWith('image/') ? image.contentType.split(';')[0] : image.bytes[0] === 0xff && image.bytes[1] === 0xd8 ? 'image/jpeg' : null;
          if (mime) value = `data:${mime};base64,${image.bytes.toString('base64')}`;
        }
      }
    } catch { /* A missing photo must never prevent linking notifications. */ }
    if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { value, expires: Date.now() + (value ? 5 * 60_000 : 20_000) });
    return value;
  }
}
