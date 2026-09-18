"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CreateCrossPromotionPlanPayload,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  TelegramAdProduct,
} from "@telegram-system/shared";
import {
  telegramAdSalesApi,
  telegramSystemBotApi,
  type Promo,
  type TelegramChannel,
  type TelegramChannelNetwork,
  type TelegramInviteLink,
} from "@/lib/api";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { renderSelectedPromoDraft } from "./promo-invite-template";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { useTelegramChannelBatchImport } from "@/hooks/use-telegram-channel-batch-import";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import type { CrossPromotionPlacementSettingsValue } from "./cross-promotion-placement-settings";
import { ensureCrossPromotionPartnerClient } from "./cross-promotion-partner-client";
import type { CrossPromotionModalMode } from "./cross-promotion-modal-title";
import { useCrossPromotionDraftState } from "./use-cross-promotion-draft-state";
import { CrossPromotionPlanView } from "./cross-promotion-plan-view";

const isOwn = (channel: TelegramChannel) => Boolean(channel.adminLinks?.length);
const searchAdvertisers = (query: string) =>
  telegramAdSalesApi.searchAdvertisers({ q: query, limit: 20 });

export function CrossPromotionPlanModal({
  open,
  kind,
  initial,
  mode = "create",
  channels,
  networks,
  loading,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: CrossPromotionPlanKind;
  initial: CrossPromotionPlan | null;
  mode?: CrossPromotionModalMode;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateCrossPromotionPlanPayload) => Promise<unknown>;
}) {
  const state = useCrossPromotionDraftState({
    open,
    initial,
    kind,
    isNewIntegration: mode === "copy",
  });
  const {
    iconId,
    title,
    publisherIds,
    partnerIds,
    setPartnerIds,
    partnerAdvertiserId,
    setPartnerAdvertiserId,
    partnerContact,
    partnerTelegram,
    targets,
    setTargets,
    post,
    setPost,
    date,
    partnerDate,
    time,
    publisherSettings,
    partnerSettings,
    outboundMode,
    outboundPost,
    setOutboundPost,
    importedChannels,
    setImportedChannels,
    setError,
    timezone,
    drafts,
  } = state;
  const [botFlowTarget, setBotFlowTarget] = useState<"post" | "outbound">(
    "post",
  );
  const resolvedTargets = useRef(
    new Map<string, { promo?: Promo; inviteLink?: TelegramInviteLink }>(),
  );
  useEffect(() => {
    if (open) resolvedTargets.current.clear();
  }, [initial, open, timezone]);

  const allChannels = useMemo(
    () => [
      ...channels,
      ...importedChannels.filter(
        (imported) => !channels.some((channel) => channel.id === imported.id),
      ),
    ],
    [channels, importedChannels],
  );
  const ownChannels = useMemo(() => allChannels.filter(isOwn), [allChannels]);
  const partnerChannels = useMemo(
    () => allChannels.filter((channel) => !isOwn(channel)),
    [allChannels],
  );
  const ownNetworks = useMemo(
    () =>
      networks.filter((network) =>
        network.channels.some((member) =>
          ownChannels.some((channel) => channel.id === member.id),
        ),
      ),
    [networks, ownChannels],
  );
  const placementChannelIds = useMemo(
    () => [...new Set([...publisherIds, ...partnerIds])].sort(),
    [partnerIds, publisherIds],
  );
  const productsQuery = useQuery({
    queryKey: telegramAdSalesKeys.productsByChannels(placementChannelIds),
    queryFn: () =>
      telegramAdSalesApi.listProductsByChannels(placementChannelIds),
    enabled: open && placementChannelIds.length > 0,
    staleTime: 60_000,
  });
  const productsByChannelId: Record<string, TelegramAdProduct[]> =
    productsQuery.data ?? {};
  const botQuery = useQuery({
    queryKey: ["telegram-system-bot", "connection"],
    queryFn: telegramSystemBotApi.connection,
    enabled: open,
    staleTime: 30_000,
  });
  const botTargetStorageKey = botQuery.data?.currentWorkspaceId
    ? `cross-promotion-post-import-target:${botQuery.data.currentWorkspaceId}`
    : undefined;
  useEffect(() => {
    if (!open || !botTargetStorageKey) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedTarget = window.localStorage.getItem(botTargetStorageKey);
      if (storedTarget === "post" || storedTarget === "outbound")
        setBotFlowTarget(storedTarget);
    });
    return () => {
      cancelled = true;
    };
  }, [botTargetStorageKey, open]);
  const targetIds = targets.map((target) => target.telegramChannelId);
  const updateTargetIds = (ids: string[]) =>
    setTargets(
      ids.map(
        (channelId) =>
          targets.find((target) => target.telegramChannelId === channelId) ?? {
            telegramChannelId: channelId,
            promoId: "",
            inviteLinkId: "",
          },
      ),
    );
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: "cross-promotion",
    importContext: "Cross-promotion plan",
    workspaceId: botQuery.data?.currentWorkspaceId,
    botUsername: botQuery.data?.botUsername,
    enabled: open,
    onImported: (draft) => {
      const storedTarget = botTargetStorageKey
        ? window.localStorage.getItem(botTargetStorageKey)
        : null;
      const target = storedTarget === "outbound" ? "outbound" : botFlowTarget;
      if (target === "outbound") setOutboundPost(draft);
      else setPost(draft);
      if (botTargetStorageKey)
        window.localStorage.removeItem(botTargetStorageKey);
    },
    errorCopy: {
      preview:
        "Select a promo and invite link, then try sending it to the bot again.",
      read: "Could not load the forwarded post from the bot.",
    },
  });
  const resetBotFlow = botFlow.reset;
  useEffect(() => {
    if (!open) void resetBotFlow();
  }, [open, resetBotFlow]);
  useEffect(() => {
    if (botFlow.terminalStatus && botTargetStorageKey)
      window.localStorage.removeItem(botTargetStorageKey);
  }, [botFlow.terminalStatus, botTargetStorageKey]);
  const partnerChannelImport = useTelegramChannelBatchImport({
    setChannels: setImportedChannels,
    setSelectedIds: setPartnerIds,
    onError: setError,
  });
  const useResolvedPromo = () => {
    const first = targets[0];
    const resolved = first
      ? resolvedTargets.current.get(first.telegramChannelId)
      : undefined;
    if (!resolved?.promo || !resolved.inviteLink) {
      setError("Select a promo and invite link first.");
      return;
    }
    setPost(renderSelectedPromoDraft(resolved.promo, resolved.inviteLink.url));
    setError("");
  };
  const hasRequiredFormat = (channelId: string, formatId?: string) => {
    const products = productsByChannelId[channelId] ?? [];
    return !products.length || Boolean(formatId);
  };
  const basicsReady =
    Boolean(title.trim()) &&
    publisherIds.length > 0 &&
    (kind !== "DIRECT_MUTUAL" || partnerIds.length > 0);
  const hasOutboundPost = Boolean(
    outboundPost.text.trim() ||
    outboundPost.imageUrls.length ||
    outboundPost.mediaItems?.length,
  );
  const promoReady =
    targets.length > 0 &&
    targets.every(
      (target) =>
        target.inviteLinkId &&
        (outboundMode === "CUSTOM" ? hasOutboundPost : target.promoId),
    );
  const placementSettingsReady =
    publisherIds.every((channelId) =>
      hasRequiredFormat(channelId, publisherSettings.formatIds[channelId]),
    ) &&
    partnerIds.every((channelId) =>
      hasRequiredFormat(channelId, partnerSettings.formatIds[channelId]),
    );
  const placement = (
    channelId: string,
    settings: CrossPromotionPlacementSettingsValue,
    defaultPlacementDate: string,
  ) => {
    const formatId = settings.formatIds[channelId] ?? "";
    const product = (productsByChannelId[channelId] ?? []).find(
      (item) => item.id === formatId,
    );
    const scheduledAt = zonedDateTimeToUtc(
      settings.dates?.[channelId] || defaultPlacementDate,
      settings.times[channelId] || time,
      timezone,
    );
    const deleteAfterHours =
      product?.deleteAfterHours ?? product?.feedDurationHours;
    return {
      telegramChannelId: channelId,
      telegramAdProductId: formatId || null,
      scheduledAt: scheduledAt.toISOString(),
      deleteAt:
        deleteAfterHours && deleteAfterHours > 0
          ? new Date(
              scheduledAt.getTime() + deleteAfterHours * 3_600_000,
            ).toISOString()
          : null,
      expectedViews: product?.estimatedViews ?? null,
    };
  };
  const submit = async () => {
    if (
      !title.trim() ||
      !publisherIds.length ||
      !targets.length ||
      !date ||
      (kind === "DIRECT_MUTUAL" && !partnerDate) ||
      !time ||
      !placementSettingsReady ||
      targets.some(
        (target) =>
          !target.inviteLinkId || (outboundMode === "PROMO" && !target.promoId),
      ) ||
      (outboundMode === "CUSTOM" && !hasOutboundPost) ||
      (kind === "DIRECT_MUTUAL" && !partnerIds.length) ||
      (!post.text.trim() && !post.imageUrls.length && !post.mediaItems?.length)
    ) {
      setError(
        "Complete channels, promos, invite links, publication post, date and time.",
      );
      return;
    }
    try {
      setError("");
      const advertiserId =
        kind === "DIRECT_MUTUAL"
          ? await ensureCrossPromotionPartnerClient({
              advertiserId: partnerAdvertiserId,
              contact: partnerContact,
              telegramUsername: partnerTelegram,
            })
          : null;
      if (advertiserId) setPartnerAdvertiserId(advertiserId);
      const publisherPlacements = publisherIds.map((channelId) =>
        placement(channelId, publisherSettings, date),
      );
      const partnerPlacements = partnerIds.map((channelId) =>
        placement(channelId, partnerSettings, partnerDate),
      );
      const trackingBoundaries = [
        ...publisherPlacements,
        ...partnerPlacements,
      ].flatMap((item) => {
        return item.deleteAt ? [new Date(item.deleteAt)] : [];
      });
      await onSubmit({
        kind,
        advertiserId: kind === "DIRECT_MUTUAL" ? advertiserId : null,
        title: title.trim(),
        publisherChannelIds: publisherIds,
        partnerChannelIds: kind === "DIRECT_MUTUAL" ? partnerIds : [],
        targets,
        publicationPost: {
          ...post,
          title: post.title.trim() || title.trim(),
          iconId,
          partnerPostSource: outboundMode,
          publisherPlacements,
          partnerPlacements,
          partnerPublicationPost: (() => {
            if (outboundMode === "CUSTOM") return outboundPost;
            const first = targets[0];
            const resolved = first
              ? resolvedTargets.current.get(first.telegramChannelId)
              : undefined;
            return resolved?.promo && resolved.inviteLink
              ? renderSelectedPromoDraft(
                  resolved.promo,
                  resolved.inviteLink.url,
                )
              : null;
          })(),
        },
        scheduledAt: zonedDateTimeToUtc(date, time, timezone).toISOString(),
        trackingEndsAt: trackingBoundaries.length
          ? new Date(
              Math.max(...trackingBoundaries.map((item) => item.getTime())),
            ).toISOString()
          : null,
      });
      drafts.clearCurrentDraft();
    } catch {
      setError("Could not create and schedule this placement.");
    }
  };
  return (
    <CrossPromotionPlanView
      open={open}
      kind={kind}
      initial={initial}
      mode={mode}
      loading={loading}
      saving={saving}
      onClose={onClose}
      onSubmit={() => void submit()}
      state={state}
      allChannels={allChannels}
      ownChannels={ownChannels}
      partnerChannels={partnerChannels}
      ownNetworks={ownNetworks}
      productsByChannelId={productsByChannelId}
      targetIds={targetIds}
      updateTargetIds={updateTargetIds}
      botConnected={Boolean(botQuery.data?.connected)}
      botFlow={botFlow}
      botFlowTarget={botFlowTarget}
      setBotFlowTarget={setBotFlowTarget}
      botTargetStorageKey={botTargetStorageKey}
      partnerImport={partnerChannelImport}
      resolvedTargets={resolvedTargets}
      useResolvedPromo={useResolvedPromo}
      basicsReady={basicsReady}
      promoReady={promoReady}
      placementSettingsReady={placementSettingsReady}
      searchAdvertisers={searchAdvertisers}
      resolveOutboundPreview={() => {
        if (outboundMode === "CUSTOM") return outboundPost;
        const first = targets[0];
        const resolved = first
          ? resolvedTargets.current.get(first.telegramChannelId)
          : undefined;
        return resolved?.promo && resolved.inviteLink
          ? renderSelectedPromoDraft(resolved.promo, resolved.inviteLink.url)
          : undefined;
      }}
    />
  );
}
