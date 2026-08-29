import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { PaginatedResponse } from "@telegram-system/shared";
import type { TelegramManagedPost } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";

/** Reconciles an authoritative managed-post mutation response without rereading the whole channel. */
export function upsertManagedPostInCache(
  current: PaginatedResponse<TelegramManagedPost> | undefined,
  post: TelegramManagedPost,
) {
  if (!current || !current.items.some((item) => item.id === post.id)) {
    return current;
  }
  return {
    ...current,
    items: current.items.map((item) => (item.id === post.id ? post : item)),
  };
}

export function mapManagedPostPages(
  queryClient: QueryClient,
  channelId: string,
  update: (
    current: PaginatedResponse<TelegramManagedPost>,
  ) => PaginatedResponse<TelegramManagedPost>,
) {
  queryClient.setQueriesData<PaginatedResponse<TelegramManagedPost>>(
    { queryKey: telegramPostKeys.managedLists(channelId) },
    (current) => (current ? update(current) : current),
  );
}

export function reconcileManagedPost(
  queryClient: QueryClient,
  channelId: string,
  post: TelegramManagedPost,
) {
  mapManagedPostPages(queryClient, channelId, (current) =>
    upsertManagedPostInCache(current, post) ?? current,
  );
  queryClient.setQueryData(
    telegramPostKeys.managedDetail(channelId, post.id),
    post,
  );
}

export function snapshotManagedPostPages(
  queryClient: QueryClient,
  channelId: string,
) {
  return queryClient.getQueriesData<PaginatedResponse<TelegramManagedPost>>({
    queryKey: telegramPostKeys.managedLists(channelId),
  });
}

export function findManagedPostInPages(
  queryClient: QueryClient,
  channelId: string,
  postId: string,
) {
  for (const [, page] of snapshotManagedPostPages(queryClient, channelId)) {
    const post = page?.items.find((item) => item.id === postId);
    if (post) return post;
  }
  return queryClient.getQueryData<TelegramManagedPost>(
    telegramPostKeys.managedDetail(channelId, postId),
  );
}

export function restoreManagedPostPages(
  queryClient: QueryClient,
  snapshots: Array<[QueryKey, PaginatedResponse<TelegramManagedPost> | undefined]>,
) {
  snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
}
