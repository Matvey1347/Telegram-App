import type { ResolvedEmoji } from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Resolve workspace-owned preference icons in batches for the settings read model. */
export async function resolveAiPostingPreferenceIcons(
  prisma: PrismaService,
  workspaceId: string,
  configuration: Record<string, unknown>,
): Promise<Record<string, ResolvedEmoji>> {
  const preferences = Array.isArray(configuration.mediaPreferences)
    ? configuration.mediaPreferences
    : [];
  const ids = [
    ...new Set(
      preferences.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
          return [];
        const id = (entry as { emojiIconId?: unknown }).emojiIconId;
        return typeof id === 'string' && id ? [id] : [];
      }),
    ),
  ].slice(0, 10);
  if (!ids.length) return {};
  const icons = await prisma.icon.findMany({
    where: { id: { in: ids }, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, type: true, name: true, emoji: true, imageUrl: true },
  });
  const documentIds = icons.flatMap((icon) => {
    const resolved = iconToResolvedEmoji(icon);
    return resolved?.type === 'unicode' && resolved.telegramCustomEmojiId
      ? [resolved.telegramCustomEmojiId]
      : [];
  });
  const assets = documentIds.length
    ? await prisma.telegramCustomEmoji.findMany({
        where: {
          documentId: { in: [...new Set(documentIds)] },
          pack: { workspaceId, archivedAt: null },
        },
        select: {
          documentId: true,
          kind: true,
          assetUrl: true,
          renderAssetUrl: true,
        },
      })
    : [];
  const byDocument = new Map(
    assets.map((asset) => [
      asset.documentId,
      { ...asset, kind: asset.kind as 'STATIC' | 'ANIMATED' | 'VIDEO' },
    ]),
  );
  return Object.fromEntries(
    icons.flatMap((icon) => {
      const base = iconToResolvedEmoji(icon);
      const asset =
        base?.type === 'unicode' && base.telegramCustomEmojiId
          ? byDocument.get(base.telegramCustomEmojiId)
          : undefined;
      const resolved = iconToResolvedEmoji(icon, asset);
      return resolved ? [[icon.id, resolved]] : [];
    }),
  );
}
