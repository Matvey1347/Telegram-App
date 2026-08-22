"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { telegramChannelsApi } from "@/lib/api";

export function useManagedPostTelegramMedia({
  channelId,
  telegramPostId,
  enabled,
}: {
  channelId: string;
  telegramPostId?: string | null;
  enabled: boolean;
}) {
  const media = useQuery({
    queryKey: ["telegram-post-media", channelId, telegramPostId],
    queryFn: () => telegramChannelsApi.postMedia(channelId, telegramPostId!),
    enabled: enabled && Boolean(telegramPostId),
    staleTime: 5 * 60_000,
  });
  const [mediaUrl, setMediaUrl] = useState("");

  useEffect(() => {
    if (!media.data?.type.startsWith("image/")) {
      // The object URL mirrors the asynchronously fetched Blob and must be
      // cleared when React Query switches the selected Telegram post.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(media.data);
    setMediaUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [media.data]);

  return mediaUrl;
}
