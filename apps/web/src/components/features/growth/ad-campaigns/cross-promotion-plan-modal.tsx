"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CreateCrossPromotionPlanPayload,
  CrossPromotionPlacementPost,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  CrossPromotionTargetInput,
  TelegramAdProduct,
  ResolvedEmoji,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import {
  authApi,
  telegramAdSalesApi,
  telegramSystemBotApi,
  type Promo,
  type TelegramChannel,
  type TelegramChannelNetwork,
  type TelegramInviteLink,
} from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  FormError,
  FormField,
  Input,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import { renderSelectedPromoDraft } from "./promo-invite-template";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { useTelegramChannelBatchImport } from "@/hooks/use-telegram-channel-batch-import";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import {
  CrossPromotionPlacementSettings,
  type CrossPromotionPlacementSettingsValue,
} from "./cross-promotion-placement-settings";
import { CrossPromotionPartnerSide } from "./cross-promotion-partner-side";
import { CrossPromotionOwnTargets } from "./cross-promotion-own-targets";
import { CrossPromotionPublicationPostEditor } from "./cross-promotion-publication-post-editor";
import { ensureCrossPromotionPartnerClient } from "./cross-promotion-partner-client";
import {
  emptyCrossPromotionPost as emptyPost,
  placementSettingsFromStored,
  type CrossPromotionModalDraft,
} from "./cross-promotion-plan-draft";
import {
  crossPromotionModalTitle,
  type CrossPromotionModalMode,
} from "./cross-promotion-modal-title";

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
  const [publisherSettings, setPublisherSettings] =
    useState<CrossPromotionPlacementSettingsValue>({
      formatIds: {},
      times: {},
    });
  const [partnerSettings, setPartnerSettings] =
    useState<CrossPromotionPlacementSettingsValue>({
      formatIds: {},
      times: {},
    });
  const [outboundMode, setOutboundMode] = useState<"PROMO" | "CUSTOM">("PROMO");
  const [outboundPost, setOutboundPost] =
    useState<TelegramSystemBotPostDraft>(emptyPost);
  const [importedChannels, setImportedChannels] = useState<TelegramChannel[]>(
    [],
  );
  const [error, setError] = useState("");
  const resolvedTargets = useRef(
    new Map<string, { promo?: Promo; inviteLink?: TelegramInviteLink }>(),
  );
  const meQuery = useQuery({
    queryKey: ["auth", "me", "cross-promotion"],
    queryFn: authApi.me,
    enabled: open,
    staleTime: 60_000,
  });
  const botQuery = useQuery({
    queryKey: ["telegram-system-bot", "connection"],
    queryFn: telegramSystemBotApi.connection,
    enabled: open,
    staleTime: 30_000,
  });
  const timezone = meQuery.data?.workspace.timezone || "Europe/Warsaw";
  useEffect(() => {
    if (!open) return;
    const initialPost = initial?.publicationPost as
      | CrossPromotionPlacementPost
      | undefined;
    const publisherPlacements = initialPost?.publisherPlacements ?? [];
    const partnerPlacements = initialPost?.partnerPlacements ?? [];
    const firstScheduledAt =
      publisherPlacements[0]?.scheduledAt ?? partnerPlacements[0]?.scheduledAt;
    const instant = firstScheduledAt
      ? new Date(firstScheduledAt)
      : new Date(Date.now() + 86_400_000);
    const partnerInstant = partnerPlacements[0]?.scheduledAt
      ? new Date(partnerPlacements[0].scheduledAt)
      : instant;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setPublisherSettings(
      placementSettingsFromStored(publisherPlacements, timezone),
    );
    setPartnerSettings(
      placementSettingsFromStored(partnerPlacements, timezone),
    );
    setOutboundMode(initialPost?.partnerPostSource ?? "PROMO");
    setOutboundPost(initialPost?.partnerPublicationPost ?? emptyPost());
    setImportedChannels([]);
    setError("");
    resolvedTargets.current.clear();
  }, [initial, open, timezone]);
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
      partnerDate,
      partnerAdvertiserId,
      partnerContact,
      partnerIds,
      partnerTelegram,
      post,
      publisherMode,
      publisherNetworkId,
      publisherSettings,
      publisherIds,
      partnerSettings,
      targets,
      time,
      title,
    ],
  );
  const draftPreview = useMemo(
    () => ({ icon: iconPresentation }),
    [iconPresentation],
  );
  const restoreDraft = useCallback(
    (
      draft: CrossPromotionModalDraft,
      storedDraft?: WorkspaceFormDraft<CrossPromotionModalDraft>,
    ) => {
      setIconId(draft.iconId ?? null);
      setIconPresentation(storedDraft?.preview?.icon ?? null);
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
      setPublisherSettings(
        draft.publisherSettings ?? { formatIds: {}, times: {} },
      );
      setPartnerSettings(draft.partnerSettings ?? { formatIds: {}, times: {} });
      setOutboundMode(draft.outboundMode ?? "PROMO");
      setOutboundPost(draft.outboundPost ?? emptyPost());
      setImportedChannels(draft.importedChannels);
      setError("");
      resolvedTargets.current.clear();
    },
    [],
  );
  const emptyDraft = useCallback<() => CrossPromotionModalDraft>(() => {
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
      publisherSettings: { formatIds: {}, times: {} },
      partnerSettings: { formatIds: {}, times: {} },
      outboundMode: "PROMO",
      outboundPost: emptyPost(),
      importedChannels: [],
    };
  }, [timezone]);
  const isMeaningfulDraft = useCallback(
    (draft: CrossPromotionModalDraft) =>
      Boolean(
        draft.title.trim() ||
        draft.iconId ||
        draft.publisherIds.length ||
        draft.partnerIds.length ||
        draft.partnerAdvertiserId ||
        draft.partnerContact?.trim() ||
        draft.targets.length ||
        draft.post.text.trim() ||
        draft.post.imageUrls.length ||
        draft.post.mediaItems?.length,
      ),
    [],
  );
  const drafts = useWorkspaceModalDrafts({
    namespace: `ads:cross-promotion:${kind}:draft`,
    open,
    enabled: !initial,
    value: draftValue,
    preview: draftPreview,
    emptyValue: emptyDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulDraft,
  });
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
  const postBotFlow = useTelegramSystemBotPostFlow({
    botUsername: botQuery.data?.botUsername,
    prepareImport: async () =>
      (await telegramSystemBotApi.preparePromoPostImport()).workflowId,
    readImport: async (workflowId) => {
      const result =
        await telegramSystemBotApi.promoPostImportResult(workflowId);
      return result.ready
        ? { ready: true as const, value: result.draft }
        : { ready: false as const };
    },
    onImported: setPost,
    sendPreview: () =>
      telegramSystemBotApi.sendMutualPromotionPostPreview(post),
    importErrorMessage: "Could not load the forwarded post from the bot.",
    sendErrorMessage: "Could not send the post preview to the bot.",
  });
  const resetPostBotFlow = postBotFlow.reset;
  const outboundBotFlow = useTelegramSystemBotPostFlow({
    botUsername: botQuery.data?.botUsername,
    prepareImport: async () =>
      (await telegramSystemBotApi.preparePromoPostImport()).workflowId,
    readImport: async (workflowId) => {
      const result =
        await telegramSystemBotApi.promoPostImportResult(workflowId);
      return result.ready
        ? { ready: true as const, value: result.draft }
        : { ready: false as const };
    },
    onImported: setOutboundPost,
    sendPreview: async () => {
      if (outboundMode === "CUSTOM") {
        await telegramSystemBotApi.sendMutualPromotionPostPreview(outboundPost);
        return;
      }
      const first = targets[0];
      const resolved = first
        ? resolvedTargets.current.get(first.telegramChannelId)
        : undefined;
      if (!resolved?.promo || !resolved.inviteLink) {
        throw new Error("Promo and invite link are required");
      }
      await telegramSystemBotApi.sendMutualPromotionPostPreview(
        renderSelectedPromoDraft(resolved.promo, resolved.inviteLink.url),
      );
    },
    sendErrorMessage:
      "Select a promo and invite link, then try sending it to the bot again.",
    importErrorMessage: "Could not load your promo from the bot.",
  });
  const resetOutboundBotFlow = outboundBotFlow.reset;
  useEffect(() => {
    if (!open) {
      resetPostBotFlow();
      resetOutboundBotFlow();
    }
  }, [open, resetOutboundBotFlow, resetPostBotFlow]);
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
    return {
      telegramChannelId: channelId,
      telegramAdProductId: formatId || null,
      scheduledAt: zonedDateTimeToUtc(
        settings.dates?.[channelId] || defaultPlacementDate,
        settings.times[channelId] || time,
        timezone,
      ).toISOString(),
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
        const product = (
          productsByChannelId[item.telegramChannelId] ?? []
        ).find((candidate) => candidate.id === item.telegramAdProductId);
        const hours = product?.deleteAfterHours ?? product?.feedDurationHours;
        return hours && hours > 0
          ? [new Date(new Date(item.scheduledAt).getTime() + hours * 3_600_000)]
          : [];
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
    <Modal
      open={open}
      onClose={onClose}
      title={crossPromotionModalTitle(mode, kind)}
      size="xl"
    >
      {loading ? (
        <LoadingState />
      ) : !initial && drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          titleFor={(draft) =>
            draft.title.trim() || "Unfinished promotion placement"
          }
          iconIdFor={(draft) => draft.iconId}
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
            <FormField label="Emoji">
              <IconPicker
                compact
                iconId={iconId}
                icon={iconPresentation}
                onChange={(value, presentation) => {
                  setIconId(value);
                  setIconPresentation(presentation ?? null);
                }}
                buttonLabel="Add emoji"
              />
            </FormField>
            <FormField label="Promotion title" required>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Mentor ↔ Partner channel"
              />
            </FormField>
          </div>

          <section className="space-y-4 rounded-xl border border-blue-900/70 bg-blue-950/10 p-4">
            <div>
              <h3 className="font-semibold text-white">My side</h3>
              <p className="text-xs text-neutral-400">
                Where I publish the partner post and what it should look like.
              </p>
            </div>
            <TelegramChannelScopeSelector
              mode={publisherMode}
              selectedNetworkId={publisherNetworkId}
              selectedChannelIds={publisherIds}
              networks={ownNetworks}
              channels={ownChannels}
              onModeChange={setPublisherMode}
              onNetworkChange={(networkId) => {
                setPublisherNetworkId(networkId);
                setPublisherIds(
                  resolveTelegramChannelScopeIds({
                    mode: "network",
                    selectedNetworkId: networkId,
                    selectedChannelIds: [],
                    networks: ownNetworks,
                  }),
                );
              }}
              onChannelsChange={setPublisherIds}
              label="My channels"
              channelsPlaceholder="Where I publish the partner post"
            />
            {publisherIds.length ? (
              <>
                <CrossPromotionPlacementSettings
                  title="Formats in my channels"
                  description="Expected views use the same channel pricing data as Ad Sale."
                  channelIds={publisherIds}
                  channels={allChannels}
                  productsByChannelId={productsByChannelId}
                  value={publisherSettings}
                  defaultDate={date}
                  defaultTime={time}
                  onDefaultDateChange={setDate}
                  onChange={setPublisherSettings}
                />
                {kind === "DIRECT_MUTUAL" ? (
                  <CrossPromotionPublicationPostEditor
                    directMutual
                    post={post}
                    publishingChannel={allChannels.find(
                      (channel) => channel.id === publisherIds[0],
                    )}
                    botConnected={Boolean(botQuery.data?.connected)}
                    importStatus={postBotFlow.importStatus}
                    sendStatus={postBotFlow.sendStatus}
                    onImport={() => void postBotFlow.startImport()}
                    onSend={() => void postBotFlow.send()}
                    onUseSelectedPromo={useResolvedPromo}
                    onChange={setPost}
                  />
                ) : null}
              </>
            ) : null}
          </section>

          {kind === "DIRECT_MUTUAL" ? (
            <CrossPromotionPartnerSide
              channels={allChannels}
              partnerChannels={partnerChannels}
              ownChannels={ownChannels}
              partnerIds={partnerIds}
              onPartnerIdsChange={setPartnerIds}
              partnerAdvertiserId={partnerAdvertiserId}
              partnerContact={partnerContact}
              onPartnerContactChange={setPartnerContact}
              onPartnerTelegramChange={setPartnerTelegram}
              onPartnerAdvertiserChange={(advertiser) =>
                setPartnerAdvertiserId(advertiser?.id ?? null)
              }
              onSearchAdvertisers={searchAdvertisers}
              importingChannel={partnerChannelImport.importing}
              onImportChannel={partnerChannelImport.importReferences}
              productsByChannelId={productsByChannelId}
              settings={partnerSettings}
              defaultDate={partnerDate}
              onDefaultDateChange={setPartnerDate}
              defaultTime={time}
              onSettingsChange={setPartnerSettings}
              basicsReady={basicsReady}
              targetIds={targetIds}
              targets={targets}
              onTargetIdsChange={updateTargetIds}
              onTargetsChange={setTargets}
              onResolved={(channelId, resolved) =>
                resolvedTargets.current.set(channelId, resolved)
              }
              outboundMode={outboundMode}
              onOutboundModeChange={(value) => {
                setOutboundMode(value);
                setTargets((current) =>
                  current.map((target) => ({
                    ...target,
                    promoId: value === "CUSTOM" ? null : target.promoId,
                  })),
                );
              }}
              outboundPost={outboundPost}
              onOutboundPostChange={setOutboundPost}
              botConnected={Boolean(botQuery.data?.connected)}
              importStatus={outboundBotFlow.importStatus}
              sendStatus={outboundBotFlow.sendStatus}
              onImportPost={() => void outboundBotFlow.startImport()}
              onSendPost={() => void outboundBotFlow.send()}
              promoReady={promoReady}
            />
          ) : null}

          {kind === "OWN_CHANNELS" && basicsReady ? (
            <CrossPromotionOwnTargets
              channels={ownChannels}
              publisherIds={publisherIds}
              targetIds={targetIds}
              targets={targets}
              onTargetIdsChange={updateTargetIds}
              onTargetsChange={setTargets}
              onResolved={(channelId, resolved) =>
                resolvedTargets.current.set(channelId, resolved)
              }
            />
          ) : null}

          {kind === "OWN_CHANNELS" &&
          basicsReady &&
          placementSettingsReady &&
          promoReady ? (
            <CrossPromotionPublicationPostEditor
              directMutual={false}
              post={post}
              publishingChannel={allChannels.find(
                (channel) => channel.id === publisherIds[0],
              )}
              botConnected={Boolean(botQuery.data?.connected)}
              importStatus={postBotFlow.importStatus}
              sendStatus={postBotFlow.sendStatus}
              onImport={() => void postBotFlow.startImport()}
              onSend={() => void postBotFlow.send()}
              onUseSelectedPromo={useResolvedPromo}
              onChange={setPost}
            />
          ) : null}
          {error || postBotFlow.error || outboundBotFlow.error ? (
            <FormError
              message={error || postBotFlow.error || outboundBotFlow.error}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? "Scheduling…" : "Create and schedule"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
