"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAllTelegramChannelInviteLinks,
  getTelegramChannelInitialInviteLink,
  getTelegramChannelInviteLinksForSelect,
  type TelegramInviteLink,
} from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";

export function useTelegramInviteLinkOptions({
  channelId,
  selectedId,
  enabled = true,
  includeUnavailable = true,
  availableForCampaignId,
  seedLinks = [],
}: {
  channelId?: string | null;
  selectedId?: string | null;
  enabled?: boolean;
  includeUnavailable?: boolean;
  availableForCampaignId?: string;
  seedLinks?: TelegramInviteLink[];
}) {
  const normalizedChannelId = channelId || "";
  const [expandedChannelId, setExpandedChannelId] = useState("");
  const allRequested = expandedChannelId === normalizedChannelId;
  const initialQuery = useQuery({
    queryKey: telegramChannelKeys.inviteLinkInitial(
      normalizedChannelId,
      selectedId,
    ),
    queryFn: () =>
      getTelegramChannelInitialInviteLink(
        normalizedChannelId,
        selectedId || undefined,
      ),
    enabled: enabled && Boolean(normalizedChannelId),
    staleTime: 30_000,
  });
  const allQuery = useQuery({
    queryKey: telegramChannelKeys.inviteLinkOptions(normalizedChannelId, {
      availableForCampaignId,
      all: includeUnavailable,
    }),
    queryFn: () =>
      includeUnavailable
        ? getAllTelegramChannelInviteLinks(normalizedChannelId)
        : getTelegramChannelInviteLinksForSelect(normalizedChannelId, {
            availableForCampaignId,
          }),
    enabled: enabled && Boolean(normalizedChannelId) && allRequested,
    staleTime: 30_000,
  });
  const links = useMemo(() => {
    const byId = new Map<string, TelegramInviteLink>();
    for (const link of seedLinks) {
      if (link.telegramChannelId === normalizedChannelId)
        byId.set(link.id, link);
    }
    for (const link of initialQuery.data ?? []) byId.set(link.id, link);
    for (const link of allQuery.data ?? []) byId.set(link.id, link);
    return [...byId.values()];
  }, [allQuery.data, initialQuery.data, normalizedChannelId, seedLinks]);

  return {
    links,
    initialLink:
      initialQuery.data?.[0] ??
      seedLinks.find(
        (link) => link.telegramChannelId === normalizedChannelId,
      ) ??
      null,
    loading: initialQuery.isLoading || (allRequested && allQuery.isFetching),
    initialLoading: initialQuery.isLoading,
    allRequested,
    requestAll: () => setExpandedChannelId(normalizedChannelId),
    error: initialQuery.error ?? allQuery.error,
  };
}
