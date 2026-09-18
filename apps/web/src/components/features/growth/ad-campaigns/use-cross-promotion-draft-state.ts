"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CrossPromotionPlacementPost,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  CrossPromotionTargetInput,
  ResolvedEmoji,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import { authApi, type TelegramChannel } from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
} from "@/lib/features/growth/telegram-ad-sales";
import type { TelegramChannelScopeMode } from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import {
  emptyCrossPromotionPost as emptyPost,
  hasMeaningfulCrossPromotionDraft,
  normalizeCrossPromotionModalDraft,
  placementSettingsFromStored,
  type CrossPromotionModalDraft,
} from "./cross-promotion-plan-draft";
import type { CrossPromotionPlacementSettingsValue } from "./cross-promotion-placement-settings";

const emptySettings = (): CrossPromotionPlacementSettingsValue => ({
  formatIds: {},
  times: {},
});

export function useCrossPromotionDraftState({
  open,
  initial,
  kind,
  isNewIntegration = false,
}: {
  open: boolean;
  initial: CrossPromotionPlan | null;
  kind: CrossPromotionPlanKind;
  isNewIntegration?: boolean;
}) {
  const [iconId, setIconId] = useState<string | null>(null);
  const [iconPresentation, setIconPresentation] =
    useState<ResolvedEmoji | null>(null);
  const [title, setTitle] = useState("");
  const [publisherMode, setPublisherMode] =
    useState<TelegramChannelScopeMode>("channels");
  const [publisherNetworkId, setPublisherNetworkId] = useState("");
  const [publisherIds, setPublisherIds] = useState<string[]>([]);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [partnerAdvertiserId, setPartnerAdvertiserId] = useState<string | null>(
    null,
  );
  const [partnerContact, setPartnerContact] = useState("");
  const [partnerTelegram, setPartnerTelegram] = useState("");
  const [targets, setTargets] = useState<CrossPromotionTargetInput[]>([]);
  const [post, setPost] = useState<TelegramSystemBotPostDraft>(emptyPost);
  const [date, setDate] = useState("");
  const [partnerDate, setPartnerDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [publisherSettings, setPublisherSettings] = useState(emptySettings);
  const [partnerSettings, setPartnerSettings] = useState(emptySettings);
  const [outboundMode, setOutboundMode] = useState<"PROMO" | "CUSTOM">("PROMO");
  const [outboundPost, setOutboundPost] =
    useState<TelegramSystemBotPostDraft>(emptyPost);
  const [importedChannels, setImportedChannels] = useState<TelegramChannel[]>(
    [],
  );
  const [error, setError] = useState("");
  const meQuery = useQuery({
    queryKey: ["auth", "me", "cross-promotion"],
    queryFn: authApi.me,
    enabled: open,
    staleTime: 60_000,
  });
  const timezone = meQuery.data?.workspace.timezone || "Europe/Warsaw";
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const initialPost = initial?.publicationPost as
        | CrossPromotionPlacementPost
        | undefined;
      const publisherPlacements = initialPost?.publisherPlacements ?? [];
      const partnerPlacements = initialPost?.partnerPlacements ?? [];
      const firstScheduledAt =
        publisherPlacements[0]?.scheduledAt ??
        partnerPlacements[0]?.scheduledAt;
      const instant = isNewIntegration
        ? new Date()
        : firstScheduledAt
          ? new Date(firstScheduledAt)
          : new Date(Date.now() + 86_400_000);
      const partnerInstant = isNewIntegration
        ? instant
        : partnerPlacements[0]?.scheduledAt
          ? new Date(partnerPlacements[0].scheduledAt)
          : instant;
      setIconId(initialPost?.iconId ?? null);
      setIconPresentation(null);
      setTitle(initial?.title ?? "");
      setPublisherMode("channels");
      setPublisherNetworkId("");
      setPublisherIds(initial?.publisherChannelIds ?? []);
      setPartnerIds(initial?.partnerChannelIds ?? []);
      setPartnerAdvertiserId(initial?.advertiserId ?? null);
      setPartnerContact(
        initial?.advertiser?.telegramUsername ??
          initial?.advertiser?.displayName ??
          "",
      );
      setPartnerTelegram(initial?.advertiser?.telegramUsername ?? "");
      setTargets(initial?.targets ?? []);
      setPost(initial?.publicationPost ?? emptyPost());
      setDate(channelLocalDateKey(instant, timezone));
      setPartnerDate(channelLocalDateKey(partnerInstant, timezone));
      setTime(channelLocalTime(instant, timezone));
      const publisherStored = placementSettingsFromStored(
        publisherPlacements,
        timezone,
      );
      const partnerStored = placementSettingsFromStored(
        partnerPlacements,
        timezone,
      );
      setPublisherSettings(
        isNewIntegration
          ? { formatIds: publisherStored.formatIds, times: {} }
          : publisherStored,
      );
      setPartnerSettings(
        isNewIntegration
          ? { formatIds: partnerStored.formatIds, times: {} }
          : partnerStored,
      );
      setOutboundMode(initialPost?.partnerPostSource ?? "PROMO");
      setOutboundPost(initialPost?.partnerPublicationPost ?? emptyPost());
      setImportedChannels([]);
      setError("");
    });
    return () => {
      cancelled = true;
    };
  }, [initial, isNewIntegration, open, timezone]);

  const draftValue = useMemo<CrossPromotionModalDraft>(
    () => ({
      iconId,
      title,
      publisherMode,
      publisherNetworkId,
      publisherIds,
      partnerIds,
      partnerAdvertiserId,
      partnerContact,
      partnerTelegram,
      targets,
      post,
      date,
      partnerDate,
      time,
      publisherSettings,
      partnerSettings,
      outboundMode,
      outboundPost,
      importedChannels,
    }),
    [
      date,
      iconId,
      importedChannels,
      outboundMode,
      outboundPost,
      partnerAdvertiserId,
      partnerContact,
      partnerDate,
      partnerIds,
      partnerSettings,
      partnerTelegram,
      post,
      publisherIds,
      publisherMode,
      publisherNetworkId,
      publisherSettings,
      targets,
      time,
      title,
    ],
  );
  const restoreDraft = useCallback(
    (
      draft: CrossPromotionModalDraft,
      stored?: WorkspaceFormDraft<CrossPromotionModalDraft>,
    ) => {
      setIconId(draft.iconId ?? null);
      setIconPresentation(stored?.preview?.icon ?? null);
      setTitle(draft.title);
      setPublisherMode(draft.publisherMode ?? "channels");
      setPublisherNetworkId(draft.publisherNetworkId ?? "");
      setPublisherIds(draft.publisherIds);
      setPartnerIds(draft.partnerIds);
      setPartnerAdvertiserId(draft.partnerAdvertiserId ?? null);
      setPartnerContact(draft.partnerContact ?? "");
      setPartnerTelegram(draft.partnerTelegram ?? "");
      setTargets(draft.targets);
      setPost(draft.post);
      setDate(draft.date);
      setPartnerDate(draft.partnerDate ?? draft.date);
      setTime(draft.time);
      setPublisherSettings(draft.publisherSettings ?? emptySettings());
      setPartnerSettings(draft.partnerSettings ?? emptySettings());
      setOutboundMode(draft.outboundMode ?? "PROMO");
      setOutboundPost(draft.outboundPost ?? emptyPost());
      setImportedChannels(draft.importedChannels);
      setError("");
    },
    [],
  );
  const emptyDraft = useCallback((): CrossPromotionModalDraft => {
    const instant = new Date(Date.now() + 86_400_000);
    return {
      iconId: null,
      title: "",
      publisherMode: "channels",
      publisherNetworkId: "",
      publisherIds: [],
      partnerIds: [],
      partnerAdvertiserId: null,
      partnerContact: "",
      partnerTelegram: "",
      targets: [],
      post: emptyPost(),
      date: channelLocalDateKey(instant, timezone),
      partnerDate: channelLocalDateKey(instant, timezone),
      time: channelLocalTime(instant, timezone),
      publisherSettings: emptySettings(),
      partnerSettings: emptySettings(),
      outboundMode: "PROMO",
      outboundPost: emptyPost(),
      importedChannels: [],
    };
  }, [timezone]);
  const drafts = useWorkspaceModalDrafts<CrossPromotionModalDraft>({
    namespace: `ads:cross-promotion:${kind}:draft`,
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: !initial,
    value: draftValue,
    preview: { title: title || "Untitled placement", icon: iconPresentation },
    createInitialValue: emptyDraft,
    normalize: normalizeCrossPromotionModalDraft,
    onRestore: restoreDraft,
    isMeaningful: hasMeaningfulCrossPromotionDraft,
  });

  return {
    iconId,
    setIconId,
    iconPresentation,
    setIconPresentation,
    title,
    setTitle,
    publisherMode,
    setPublisherMode,
    publisherNetworkId,
    setPublisherNetworkId,
    publisherIds,
    setPublisherIds,
    partnerIds,
    setPartnerIds,
    partnerAdvertiserId,
    setPartnerAdvertiserId,
    partnerContact,
    setPartnerContact,
    partnerTelegram,
    setPartnerTelegram,
    targets,
    setTargets,
    post,
    setPost,
    date,
    setDate,
    partnerDate,
    setPartnerDate,
    time,
    publisherSettings,
    setPublisherSettings,
    partnerSettings,
    setPartnerSettings,
    outboundMode,
    setOutboundMode,
    outboundPost,
    setOutboundPost,
    importedChannels,
    setImportedChannels,
    error,
    setError,
    timezone,
    drafts,
  };
}
