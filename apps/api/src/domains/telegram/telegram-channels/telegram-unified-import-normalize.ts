import type { TelegramUnifiedImportManifest } from '@telegram-system/shared';

function cleanUnifiedImportImageUrl(value: string) {
  let normalized = value.trim().replace(/^["']|["']$/g, '');
  const markdownLink = normalized.match(/\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownLink?.[1]) normalized = markdownLink[1];
  const bareUrl = normalized.match(/https?:\/\/[^\s"'\])]+/i);
  return bareUrl?.[0] ?? normalized;
}

export function normalizeUnifiedImportManifest(
  manifest: TelegramUnifiedImportManifest,
): TelegramUnifiedImportManifest {
  return {
    ...manifest,
    posts: manifest.posts?.map((post) => ({
      ...post,
      imageUrls: post.imageUrls
        ?.flatMap((value) => value.split(/\r?\n|,\s*(?=https?:\/\/)/i))
        .map(cleanUnifiedImportImageUrl)
        .filter(Boolean),
    })),
  };
}
