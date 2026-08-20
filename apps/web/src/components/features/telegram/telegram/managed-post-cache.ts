import type { TelegramManagedPost } from "@/lib/api";

/** Reconciles an authoritative managed-post mutation response without rereading the whole channel. */
export function upsertManagedPostInCache(
  current: TelegramManagedPost[] | undefined,
  post: TelegramManagedPost,
) {
  if (!current) return [post];
  const index = current.findIndex((item) => item.id === post.id);
  if (index === -1) return [post, ...current];
  return current.map((item) => (item.id === post.id ? post : item));
}
