"use client";

import { useCallback, useMemo, useState } from "react";
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
  selectedIds = [],
  enabled = true,
  includeUnavailable = true,
  availableForCampaignId,
  seedLinks = [],
  loadAllInitially = false,
}: {
  channelId?: string | null;
  selectedId?: string | null;
  selectedIds?: string[];
  enabled?: boolean;
  includeUnavailable?: boolean;
  availableForCampaignId?: string;
  seedLinks?: TelegramInviteLink[];
  loadAllInitially?: boolean;
}) {
  const normalizedChannelId = channelId || "";
  const [expandedChannelId, setExpandedChannelId] = useState("");
  const allRequested =
    loadAllInitially || expandedChannelId === normalizedChannelId;
  const initialQuery = useQuery({
    queryKey: telegramChannelKeys.inviteLinkInitial(
      normalizedChannelId,
      selectedId,
      selectedIds,
    ),
    queryFn: () =>
      getTelegramChannelInitialInviteLink(
        normalizedChannelId,
        selectedId || undefined,
        selectedIds,
      ),
    enabled: enabled && Boolean(normalizedChannelId) && !loadAllInitially,
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
  const requestAll = useCallback(
    () => setExpandedChannelId(normalizedChannelId),
    [normalizedChannelId],
  );

  return {
    links,
    initialLink:
      initialQuery.data?.[0] ??
      allQuery.data?.find((link) => link.id === selectedId) ??
      seedLinks.find(
        (link) =>
          link.telegramChannelId === normalizedChannelId &&
          (!selectedId || link.id === selectedId),
      ) ??
      null,
    loading: initialQuery.isLoading || (allRequested && allQuery.isFetching),
    initialLoading: initialQuery.isLoading,
    allRequested,
    requestAll,
    error: initialQuery.error ?? allQuery.error,
  };
}
