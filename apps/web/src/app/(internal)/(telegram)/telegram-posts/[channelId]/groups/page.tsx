"use client";

import type { ReactElement } from "react";
import { useParams } from "next/navigation";
import TelegramPostsPageModule from "../../page";

const TelegramPostsPageClient = TelegramPostsPageModule as (props: {
  routeChannelId?: string;
  routePostView: "groups";
}) => ReactElement;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function TelegramPostGroupsPage() {
  const params = useParams<{ channelId?: string | string[] }>();
  return (
    <TelegramPostsPageClient
      routeChannelId={routeParam(params.channelId)}
      routePostView="groups"
    />
  );
}
