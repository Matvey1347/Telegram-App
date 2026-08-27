import type { ResolvedEmoji } from '@telegram-system/shared';
import { storedTelegramIconPresentation } from '../../telegram/shared/telegram-bot-icon-source';

export type ResolvedEmojiIconSource = {
  id: string;
  type: 'emoji' | 'image';
  name?: string | null;
  emoji?: string | null;
  imageUrl?: string | null;
};

export type ResolvedEmojiTelegramAsset = {
  kind: 'STATIC' | 'ANIMATED' | 'VIDEO';
  assetUrl?: string | null;
  renderAssetUrl?: string | null;
};

export function iconToResolvedEmoji(
  icon?: ResolvedEmojiIconSource | null,
  telegramAsset?: ResolvedEmojiTelegramAsset | null,
): ResolvedEmoji | null {
  if (!icon) return null;

  if (icon.type === 'emoji' && icon.emoji) {
    const presentation = {
      ...storedTelegramIconPresentation(icon.emoji, '·'),
      name: icon.name ?? null,
    };
    return presentation.type === 'unicode' && presentation.telegramCustomEmojiId
      ? {
          ...presentation,
          telegramCustomEmojiKind: telegramAsset?.kind ?? null,
          telegramCustomEmojiAssetUrl: telegramAsset?.assetUrl ?? null,
          telegramCustomEmojiRenderAssetUrl:
            telegramAsset?.renderAssetUrl ?? null,
        }
      : presentation;
  }

  if (icon.type === 'image' && icon.imageUrl) {
    return {
      type: 'image',
      id: icon.id,
      url: icon.imageUrl,
      name: icon.name ?? null,
    };
  }

  return null;
}
