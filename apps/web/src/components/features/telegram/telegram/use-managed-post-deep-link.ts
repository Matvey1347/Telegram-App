"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { reconcileManagedPost } from "./managed-post-cache";

export function useManagedPostDeepLink({
  channelId,
  postId,
  queryClient,
}: {
  channelId: string;
  postId: string;
  queryClient: QueryClient;
}) {
  return useQuery({
    queryKey: telegramPostKeys.managedDetail(channelId, postId),
    queryFn: async () => {
      const post = await telegramChannelsApi.managedPost(channelId, postId);
      reconcileManagedPost(queryClient, channelId, post);
      return post;
    },
    enabled: Boolean(postId),
    // The editor must never reopen a cached schedule: an ad-sale placement can
    // reschedule this post from a different screen immediately before navigation.
    staleTime: 0,
    refetchOnMount: "always",
  });
}
