"use client";

import { useParams } from "next/navigation";
import { TelegramPostsPageClient } from "@/components/features/telegram/telegram/posts-workspace/telegram-posts-page-client";

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function TelegramPostsCalendarPage() {
  const params = useParams<{ channelId?: string | string[] }>();
  return (
    <TelegramPostsPageClient
      routeChannelId={routeParam(params.channelId)}
      routePostView="calendar"
    />
  );
}
