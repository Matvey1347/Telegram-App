import { gunzipSync } from 'node:zlib';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import type { ResolvedEmoji } from '@telegram-system/shared';

const MAX_ASSET_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_ANIMATION_BYTES = 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;

type Asset = Extract<ResolvedEmoji, { type: 'unicode' }>;

/** Per-session, bounded immutable asset cache. No database or background refresh. */
export class CrmReactionAssets {
  private readonly cache = new Map<string, { asset: Asset; bytes: number }>();
  private size = 0;
  constructor(private readonly client: TelegramClient) {}

  async get(
    ids: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, ResolvedEmoji>> {
    if (signal?.aborted) throw new Error('REQUEST_ABORTED');
    const unique = [
      ...new Set(ids.filter((id) => /^\d{1,20}$/.test(id))),
    ].slice(0, 50);
    const missing = unique.filter((id) => !this.cache.has(id));
    if (missing.length) {
      const docs = await this.client.invoke(
        new Api.messages.GetCustomEmojiDocuments({
          documentId: missing.map(returnBigInt),
        }),
      );
      for (const doc of docs) {
        if (signal?.aborted) throw new Error('REQUEST_ABORTED');
        if (
          !(doc instanceof Api.Document) ||
          !missing.includes(doc.id.toString())
        )
          continue;
        const sticker = doc.attributes.find(
          (attr) => attr instanceof Api.DocumentAttributeCustomEmoji,
        );
        if (!(sticker instanceof Api.DocumentAttributeCustomEmoji)) continue;
        const kind =
          doc.mimeType === 'application/x-tgsticker'
            ? 'ANIMATED'
            : doc.mimeType === 'video/webm'
              ? 'VIDEO'
              : doc.mimeType === 'image/webp'
                ? 'STATIC'
                : null;
        if (!kind || Number(doc.size) > MAX_ASSET_BYTES) continue;
        try {
          const downloaded = await this.client.downloadMedia(
            new Api.MessageMediaDocument({ document: doc }),
            {},
          );
          if (signal?.aborted) throw new Error('REQUEST_ABORTED');
          if (!downloaded || typeof downloaded === 'string') continue;
          const raw = Buffer.from(downloaded);
          if (!raw.length || raw.length > MAX_ASSET_BYTES) continue;
          const bytes =
            kind === 'ANIMATED'
              ? gunzipSync(raw, { maxOutputLength: MAX_ANIMATION_BYTES })
              : raw;
          if (kind === 'ANIMATED') JSON.parse(bytes.toString('utf8'));
          const mime = kind === 'ANIMATED' ? 'application/json' : doc.mimeType;
          const url = `data:${mime};base64,${bytes.toString('base64')}`;
          const asset: Asset = {
            type: 'unicode',
            value: sticker.alt || '◌',
            telegramCustomEmojiId: doc.id.toString(),
            telegramCustomEmojiKind: kind,
            ...(kind === 'ANIMATED'
              ? { telegramCustomEmojiRenderAssetUrl: url }
              : { telegramCustomEmojiAssetUrl: url }),
          };
          this.cache.set(doc.id.toString(), { asset, bytes: url.length });
          this.size += url.length;
          while (this.cache.size > 128 || this.size > MAX_CACHE_BYTES) {
            const first = this.cache.keys().next().value as string;
            this.size -= this.cache.get(first)!.bytes;
            this.cache.delete(first);
          }
        } catch (error) {
          if (signal?.aborted) throw error; /* Keep other available emoji. */
        }
      }
    }
    const items: Record<string, ResolvedEmoji> = {};
    let responseSize = 0;
    for (const id of unique) {
      const cached = this.cache.get(id);
      if (!cached || responseSize + cached.bytes > MAX_RESPONSE_BYTES) continue;
      items[id] = cached.asset;
      responseSize += cached.bytes;
    }
    return items;
  }
}
