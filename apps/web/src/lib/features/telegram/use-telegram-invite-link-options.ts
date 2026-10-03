"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAllTelegramChannelInviteLinks,
  getTelegramChannelInitialInviteLink,
  getTelegramChannelInviteLinksForSelect,
  type TelegramInviteLinkOption,
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
  search = "",
  searchMinimumLength = 0,
}: {
  channelId?: string | null;
  selectedId?: string | null;
  selectedIds?: string[];
  enabled?: boolean;
  includeUnavailable?: boolean;
  availableForCampaignId?: string;
  seedLinks?: TelegramInviteLinkOption[];
  loadAllInitially?: boolean;
  search?: string;
  searchMinimumLength?: number;
}) {
  const normalizedChannelId = channelId || "";
  const normalizedSearch = search.trim();
  const searchRequested =
    searchMinimumLength > 0 &&
    normalizedSearch.length >= searchMinimumLength;
  const [expandedChannelId, setExpandedChannelId] = useState("");
  const allRequested =
    loadAllInitially || expandedChannelId === normalizedChannelId;
  const shouldLoadOptions = allRequested || searchRequested;
  const hasSeededInitialLink = seedLinks.some(
    (link) =>
      link.telegramChannelId === normalizedChannelId &&
      (selectedId
        ? link.id === selectedId
        : Boolean(link.isDefaultForChannel)),
  );
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
    enabled:
      enabled &&
      Boolean(normalizedChannelId) &&
      !loadAllInitially &&
      !hasSeededInitialLink,
    staleTime: 30_000,
  });
  const allQuery = useQuery({
    queryKey: telegramChannelKeys.inviteLinkOptions(normalizedChannelId, {
      availableForCampaignId,
      all: includeUnavailable,
      search: normalizedSearch || undefined,
    }),
    queryFn: () =>
      includeUnavailable
        ? getAllTelegramChannelInviteLinks(normalizedChannelId, {
            ...(normalizedSearch ? { search: normalizedSearch } : {}),
          })
        : getTelegramChannelInviteLinksForSelect(normalizedChannelId, {
            availableForCampaignId,
            ...(normalizedSearch ? { search: normalizedSearch } : {}),
          }),
    enabled: enabled && Boolean(normalizedChannelId) && shouldLoadOptions,
    staleTime: 30_000,
  });
  const links = useMemo(() => {
    const byId = new Map<string, TelegramInviteLinkOption>();
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
  const initialLink =
    seedLinks.find(
      (link) =>
        link.telegramChannelId === normalizedChannelId &&
        (selectedId
          ? link.id === selectedId
          : Boolean(link.isDefaultForChannel)),
    ) ??
    initialQuery.data?.find((link) => link.id === selectedId) ??
    initialQuery.data?.find((link) => link.isDefaultForChannel) ??
    allQuery.data?.find((link) => link.id === selectedId) ??
    allQuery.data?.find((link) => link.isDefaultForChannel) ??
    null;

  return {
    links,
    initialLink,
    loading:
      initialQuery.isLoading || (shouldLoadOptions && allQuery.isFetching),
    initialLoading: initialQuery.isLoading,
    allRequested,
    requestAll,
    error: initialQuery.error ?? allQuery.error,
  };
}
