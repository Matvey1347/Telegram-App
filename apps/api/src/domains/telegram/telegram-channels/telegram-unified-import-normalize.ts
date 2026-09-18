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
  const schedule = manifest.schedule?.filter((operation, index, operations) => {
    if (operation.action !== 'UNSCHEDULE' || !operation.postId) return true;
    return !operations.some(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.action !== 'UNSCHEDULE' &&
        candidate.postId === operation.postId,
    );
  });
  return {
    ...manifest,
    groups: manifest.groups?.map((group) => ({ ...group })),
    hypotheses: manifest.hypotheses?.map((hypothesis) => ({
      ...hypothesis,
      value: hypothesis.value ? { ...hypothesis.value } : undefined,
    })),
    posts: manifest.posts?.map((post) => ({
      ...post,
      imageUrls: post.imageUrls
        ?.flatMap((value) => value.split(/\r?\n|,\s*(?=https?:\/\/)/i))
        .map(cleanUnifiedImportImageUrl)
        .filter(Boolean),
    })),
    // A generated plan may express a move as UNSCHEDULE followed by SCHEDULE.
    // SCHEDULE already reschedules an existing publication atomically, so keep
    // only the final operation instead of reporting a false conflict.
    schedule: schedule?.map((operation) => ({ ...operation })),
    delete: manifest.delete
      ? {
          groups: manifest.delete.groups?.map((target) => ({ ...target })),
          hypotheses: manifest.delete.hypotheses?.map((target) => ({
            ...target,
          })),
          posts: manifest.delete.posts?.map((target) => ({ ...target })),
        }
      : undefined,
  };
}
