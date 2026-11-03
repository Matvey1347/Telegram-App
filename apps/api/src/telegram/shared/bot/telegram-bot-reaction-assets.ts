import { gunzipSync } from 'node:zlib';
import { Injectable } from '@nestjs/common';
import type { ResolvedEmoji } from '@telegram-system/shared';
import { TelegramBotApiClient } from './telegram-bot-api.client';

const MAX_FILE = 256 * 1024;
const MAX_CACHE = 8 * 1024 * 1024;
const MAX_ANIMATION = 1024 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;
type Sticker = {
  custom_emoji_id?: string;
  file_id: string;
  emoji?: string;
  is_animated: boolean;
  is_video: boolean;
  file_size?: number;
};

/** Read-only Bot API lookup, bounded per process and never sharing a user session. */
@Injectable()
export class TelegramBotReactionAssets {
  private readonly cache = new Map<
    string,
    { asset: ResolvedEmoji; bytes: number }
  >();
  private size = 0;
  constructor(private readonly api: TelegramBotApiClient) {}

  async get(
    token: string,
    ids: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, ResolvedEmoji>> {
    const unique = [
      ...new Set(ids.filter((id) => /^\d{1,20}$/.test(id))),
    ].slice(0, 50);
    const missing = unique.filter((id) => !this.cache.has(id));
    if (signal?.aborted) throw new Error('REQUEST_ABORTED');
    if (missing.length) {
      const stickers = await this.api.call<Sticker[]>(
        token,
        'getCustomEmojiStickers',
        { custom_emoji_ids: missing },
      );
      for (const sticker of stickers) {
        if (signal?.aborted) throw new Error('REQUEST_ABORTED');
        const id = sticker.custom_emoji_id;
        if (
          !id ||
          !missing.includes(id) ||
          !sticker.file_id ||
          (sticker.file_size ?? 0) > MAX_FILE
        )
          continue;
        try {
          const file = await this.api.getFile(token, sticker.file_id);
          if (!file.file_path || (file.file_size ?? 0) > MAX_FILE) continue;
          const { bytes: raw } = await this.api.downloadFile(
            token,
            file.file_path,
            MAX_FILE,
          );
          if (signal?.aborted) throw new Error('REQUEST_ABORTED');
          const kind = sticker.is_animated
            ? 'ANIMATED'
            : sticker.is_video
              ? 'VIDEO'
              : 'STATIC';
          const bytes =
            kind === 'ANIMATED'
              ? gunzipSync(raw, { maxOutputLength: MAX_ANIMATION })
              : raw;
          if (
            !bytes.length ||
            bytes.length > (kind === 'ANIMATED' ? MAX_ANIMATION : MAX_FILE)
          )
            continue;
          if (kind === 'ANIMATED') JSON.parse(bytes.toString('utf8'));
          const mime =
            kind === 'ANIMATED'
              ? 'application/json'
              : kind === 'VIDEO'
                ? 'video/webm'
                : 'image/webp';
          const url = `data:${mime};base64,${bytes.toString('base64')}`;
          const asset: ResolvedEmoji = {
            type: 'unicode',
            value: sticker.emoji || '◌',
            telegramCustomEmojiId: id,
            telegramCustomEmojiKind: kind,
            ...(kind === 'ANIMATED'
              ? { telegramCustomEmojiRenderAssetUrl: url }
              : { telegramCustomEmojiAssetUrl: url }),
          };
          this.cache.set(id, { asset, bytes: url.length });
          this.size += url.length;
          while (this.cache.size > 128 || this.size > MAX_CACHE) {
            const oldest = this.cache.keys().next().value as string;
            this.size -= this.cache.get(oldest)!.bytes;
            this.cache.delete(oldest);
          }
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }
    }
    let total = 0;
    return Object.fromEntries(
      unique.flatMap((id) => {
        const cached = this.cache.get(id);
        if (!cached || total + cached.bytes > MAX_RESPONSE) return [];
        total += cached.bytes;
        return [[id, cached.asset]];
      }),
    );
  }
}
