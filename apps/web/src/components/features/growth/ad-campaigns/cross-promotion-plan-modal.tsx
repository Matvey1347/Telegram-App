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
    additionalPublisherPosts,
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
  const [botFlowTarget, setBotFlowTarget] = useState("post");
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const resolvedTargets = useRef(
    new Map<string, { promo?: Promo; inviteLink?: TelegramInviteLink }>(),
  );
  useEffect(() => {
    if (open) {
      resolvedTargets.current.clear();
      setShowValidationErrors(false);
    }
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
  const resolvedTarget = (target: (typeof targets)[number], index: number) =>
    resolvedTargets.current.get(`target:${index}`) ??
    resolvedTargets.current.get(target.telegramChannelId);
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
      const target = storedTarget ?? botFlowTarget;
      if (target === "outbound") setOutboundPost(draft);
      else if (target.startsWith("publisher:")) {
        const publicationId = target.slice("publisher:".length);
        state.setAdditionalPublisherPosts((current) =>
          current.map((publication) =>
            publication.id === publicationId
              ? { ...publication, post: draft }
              : publication,
          ),
        );
      } else setPost(draft);
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
  const hasRequiredFormat = (channelId: string, formatId?: string) => {
    const products = productsByChannelId[channelId] ?? [];
    return !products.length || Boolean(formatId);
  };
  const basicsReady = Boolean(title.trim()) && publisherIds.length > 0;
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
    const hasPostContent = Boolean(
      post.text.trim() || post.imageUrls.length || post.mediaItems?.length,
    );
    const firstTarget = targets[0];
    const resolved = firstTarget ? resolvedTarget(firstTarget, 0) : undefined;
    const selectedPromoPost =
      resolved?.promo && resolved.inviteLink
        ? renderSelectedPromoDraft(resolved.promo, resolved.inviteLink.url)
        : null;
    // Own-channel promotion publishes the selected reusable promo. A manually
    // composed post remains an explicit optional override, never a requirement.
    const publicationPost =
      kind === "OWN_CHANNELS" && !hasPostContent ? selectedPromoPost : post;
    const channelNames = (channelIds: string[]) =>
      channelIds
        .map(
          (channelId) =>
            allChannels.find((channel) => channel.id === channelId)?.title ??
            "Unknown channel",
        )
        .join(", ");
    const missingPublisherFormats = publisherIds.filter(
      (channelId) =>
        !hasRequiredFormat(channelId, publisherSettings.formatIds[channelId]),
    );
    const missingPartnerFormats = partnerIds.filter(
      (channelId) =>
        !hasRequiredFormat(channelId, partnerSettings.formatIds[channelId]),
    );
    const missingAdditionalFormats = additionalPublisherPosts.flatMap(
      (publication, index) => {
        const missing = publisherIds.filter(
          (channelId) =>
            !hasRequiredFormat(
              channelId,
              publication.settings.formatIds[channelId],
            ),
        );
        return missing.length
          ? [`Partner post ${index + 2}: choose a format for ${channelNames(missing)}.`]
          : [];
      },
    );
    const validationErrors = [
      !title.trim() ? "Enter a promotion title." : null,
      !publisherIds.length ? "Choose at least one channel on My side." : null,
      !date ? "Choose a publication date for Partner post 1." : null,
      !time ? "Choose a publication time for Partner post 1." : null,
      missingPublisherFormats.length
        ? `Partner post 1: choose a format for ${channelNames(missingPublisherFormats)}.`
        : null,
      kind === "DIRECT_MUTUAL" && !hasPostContent
        ? "Partner post 1: add text or media before scheduling."
        : null,
      ...additionalPublisherPosts.flatMap((publication, index) =>
        publication.post.text.trim() ||
        publication.post.imageUrls.length ||
        publication.post.mediaItems?.length
          ? []
          : [`Partner post ${index + 2}: add text or media before scheduling.`],
      ),
      ...missingAdditionalFormats,
      !targets.length ? "Add at least one promo placement on Partner side." : null,
      ...targets.flatMap((target, index) => [
        !target.telegramChannelId
          ? `Promo placement ${index + 1}: choose the promoted channel.`
          : null,
        outboundMode === "PROMO" && !target.promoId
          ? `Promo placement ${index + 1}: choose a saved promo.`
          : null,
        !target.inviteLinkId
          ? `Promo placement ${index + 1}: choose a tracking invite link.`
          : null,
      ]),
      missingPartnerFormats.length
        ? `Partner side: choose a format for ${channelNames(missingPartnerFormats)}.`
        : null,
      outboundMode === "CUSTOM" && !hasOutboundPost
        ? "My custom promo: add text or media before scheduling."
        : null,
      !publicationPost ? "Choose or compose the post to publish." : null,
    ].filter((message): message is string => Boolean(message));
    if (validationErrors.length) {
      setShowValidationErrors(true);
      setError("Fix the highlighted fields before saving.");
      return;
    }
    // `publicationPost` is covered by the validation above. Keep this guard
    // explicit so the persisted payload can never contain a null post.
    if (!publicationPost) return;
    try {
      setShowValidationErrors(false);
      setError("");
      const advertiserId =
        kind === "DIRECT_MUTUAL" && partnerContact.trim()
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
      const publisherPublications = [
        {
          id: "publisher-1",
          post: {
            ...publicationPost,
            title: publicationPost.title.trim() || title.trim(),
          },
          placements: publisherPlacements,
        },
        ...additionalPublisherPosts.map((publication) => ({
          id: publication.id,
          post: {
            ...publication.post,
            title: publication.post.title.trim() || title.trim(),
          },
          placements: publisherIds.map((channelId) =>
            placement(channelId, publication.settings, date),
          ),
        })),
      ];
      // Keep the plan anchor aligned with the first post Telegram will really
      // publish. Individual channel settings can override the form default;
      // sending that stale default made a future per-channel schedule look
      // historical to the reschedule endpoint.
      const scheduledAt = new Date(
        Math.min(
          ...publisherPublications.flatMap((publication) =>
            publication.placements.map((placement) =>
              Date.parse(placement.scheduledAt),
            ),
          ),
        ),
      ).toISOString();
      const trackingBoundaries = [
        ...publisherPublications.flatMap(
          (publication) => publication.placements,
        ),
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
          ...publicationPost,
          title: publicationPost.title.trim() || title.trim(),
          iconId,
          partnerPostSource: outboundMode,
          publisherPlacements,
          partnerPlacements,
          publisherPublications,
          partnerPublications: targets.map((target, index) => {
            const resolved = resolvedTarget(target, index);
            const generated =
              outboundMode === "PROMO" && resolved?.promo && resolved.inviteLink
                ? renderSelectedPromoDraft(
                    resolved.promo,
                    resolved.inviteLink.url,
                  )
                : outboundPost;
            return {
              id: `partner-${index + 1}`,
              target,
              post: generated,
              placements: partnerPlacements,
            };
          }),
          partnerPublicationPost: (() => {
            if (outboundMode === "CUSTOM") return outboundPost;
            const first = targets[0];
            const resolved = first ? resolvedTarget(first, 0) : undefined;
            return resolved?.promo && resolved.inviteLink
              ? renderSelectedPromoDraft(
                  resolved.promo,
                  resolved.inviteLink.url,
                )
              : null;
          })(),
        },
        scheduledAt,
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
      basicsReady={basicsReady}
      promoReady={promoReady}
      showValidationErrors={showValidationErrors}
      searchAdvertisers={searchAdvertisers}
      resolveOutboundPreview={(targetIndex = 0) => {
        if (outboundMode === "CUSTOM") return outboundPost;
        const target = targets[targetIndex];
        const resolved = target ? resolvedTarget(target, targetIndex) : undefined;
        return resolved?.promo && resolved.inviteLink
          ? renderSelectedPromoDraft(resolved.promo, resolved.inviteLink.url)
          : undefined;
      }}
      onImportPublisherPost={(id) => {
        const target = `publisher:${id}`;
        setBotFlowTarget(target);
        if (botTargetStorageKey)
          window.localStorage.setItem(botTargetStorageKey, target);
        void botFlow.startImport();
      }}
      onSendPublisherPost={(id, publisherPost) => {
        const target = `publisher:${id}`;
        setBotFlowTarget(target);
        if (botTargetStorageKey)
          window.localStorage.setItem(botTargetStorageKey, target);
        void botFlow.send(publisherPost);
      }}
    />
  );
}
