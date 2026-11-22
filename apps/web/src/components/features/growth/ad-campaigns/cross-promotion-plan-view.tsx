"use client";
import { useRef, useState, type MutableRefObject } from "react";
import { trackingLinkTitle } from "./cross-promotion-auto-title";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type {
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  TelegramChannelNetworkOption,
  TelegramAdProduct,
  TelegramAdvertiser,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import type { Promo, TelegramChannel, TelegramInviteLinkOption } from "@/lib/api";
import { Button, FormError, LoadingState, Modal, ModalBackButton } from "@/components/ui/primitives";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import { crossPromotionBotFlowForTarget, type CrossPromotionBotFlow } from "./cross-promotion-bot-flow-status";
import { CrossPromotionPlacementSettings } from "./cross-promotion-placement-settings";
import { CrossPromotionPartnerSide } from "./cross-promotion-partner-side";
import { CrossPromotionOwnTargets } from "./cross-promotion-own-targets";
import { CrossPromotionPublicationPostEditor } from "./cross-promotion-publication-post-editor";
import type { useCrossPromotionDraftState } from "./use-cross-promotion-draft-state";
import { crossPromotionModalTitle, type CrossPromotionModalMode } from "./cross-promotion-modal-title";
import { emptyCrossPromotionPost } from "./cross-promotion-plan-draft";
import { FormSectionNumber } from "../form-section-number";
import { CrossPromotionPlanSummary } from "./cross-promotion-plan-summary";
import { CrossPromotionPlanActions } from "./cross-promotion-plan-actions";
import { canUpdatePublicationInTelegram } from "./cross-promotion-publication-actions";
import { buildCrossPromotionChannelActions } from "./cross-promotion-channel-actions";
import { CrossPromotionIdentityStep } from "./cross-promotion-create-steps";

type DraftState = ReturnType<typeof useCrossPromotionDraftState>;

export function CrossPromotionPlanView({
  open,
  kind,
  onBack,
  initial,
  mode,
  loading,
  saving,
  savingDraft,
  onClose,
  onSubmit,
  onReplaceAndPublishNow,
  onUpdatePublicationInTelegram,
  onReplacePublicationAndPublishNow,
  onUpdatePublicationChannelSchedule,
  onReplacePublicationChannelSchedule,
  onSaveDraft,
  onUpdateDetails,
  state,
  allChannels,
  ownChannels,
  ownNetworks,
  productsByChannelId,
  targetIds,
  updateTargetIds,
  botConnected,
  botFlow,
  botFlowTarget,
  setBotFlowTarget,
  botTargetStorageKey,
  resolvedTargets,
  promoReady,
  searchAdvertisers,
  resolveOutboundPreview,
  onSendPublisherPost,
  showValidationErrors,
  sharedPublicationChanged,
  requiresRepublish,
  publicationChanges,
  publicationHasTelegramMessage,
}: {
  open: boolean;
  kind: CrossPromotionPlanKind;
  onBack?: () => void;
  initial: CrossPromotionPlan | null;
  mode: CrossPromotionModalMode;
  loading: boolean;
  saving: boolean;
  savingDraft: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onReplaceAndPublishNow?: () => void;
  onUpdatePublicationInTelegram?: (publicationId: string) => void;
  onReplacePublicationAndPublishNow?: (publicationId: string) => void;
  onUpdatePublicationChannelSchedule?: (publicationId: string, channelId: string) => void;
  onReplacePublicationChannelSchedule?: (publicationId: string, channelId: string) => void;
  onSaveDraft: () => void;
  onUpdateDetails?: () => void;
  state: DraftState;
  allChannels: TelegramChannel[];
  ownChannels: TelegramChannel[];
  ownNetworks: TelegramChannelNetworkOption[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  targetIds: string[];
  updateTargetIds: (ids: string[]) => void;
  botConnected: boolean;
  botFlow: CrossPromotionBotFlow;
  botFlowTarget: string;
  setBotFlowTarget: (target: string) => void;
  botTargetStorageKey?: string;
  resolvedTargets: MutableRefObject<Map<string, { promo?: Promo; inviteLink?: TelegramInviteLinkOption }>>;
  promoReady: boolean;
  searchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  resolveOutboundPreview: (targetIndex?: number) => TelegramSystemBotPostDraft | undefined;
  onSendPublisherPost: (id: string, post: TelegramSystemBotPostDraft) => void;
  showValidationErrors: boolean;
  sharedPublicationChanged: boolean;
  requiresRepublish: boolean;
  publicationChanges: Record<string, boolean>;
  publicationHasTelegramMessage: Record<string, boolean>;
}) {
  const [mySideOpen, setMySideOpen] = useState(true);
  const [partnerSideOpen, setPartnerSideOpen] = useState(true);
  const [publisherPostOpen, setPublisherPostOpen] = useState<Record<string, boolean>>({});
  const [clearedPublisherPosts, setClearedPublisherPosts] = useState<Record<string, boolean>>({});
  const {
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
    additionalPublisherPosts,
    setAdditionalPublisherPosts,
    date,
    setDate,
    partnerDate,
    setPartnerDate,
    time,
    setTime,
    publisherSettings,
    setPublisherSettings,
    partnerSettings,
    setPartnerSettings,
    outboundMode,
    setOutboundMode,
    outboundPost,
    setOutboundPost,
    error,
    drafts,
  } = state;
  const autoTitle = useRef<string | null>(null);
  const suggestTitleFromTrackingLink = (link?: TelegramInviteLinkOption) => {
    const next = trackingLinkTitle(title, autoTitle.current, link?.name);
    if (next) {
      autoTitle.current = next;
      setTitle(next);
    }
  };
  const publishedPrimaryMediaCount =
    initial?.status === "ACTIVE"
      ? normalizeTelegramPostMediaItems(
          initial.publicationPost.publisherPublications?.[0]?.post.mediaItems ??
            initial.publicationPost.mediaItems,
          initial.publicationPost.publisherPublications?.[0]?.post.imageUrls ?? initial.publicationPost.imageUrls,
        ).length
      : undefined;
  const botStatusFor = (target: string) => crossPromotionBotFlowForTarget(botFlow, botFlowTarget, target);
  const postStatus = botStatusFor("post");
  const outboundStatus = botStatusFor("outbound");
  const publisherPostStatus = (id: string) => botStatusFor(`publisher:${id}`);
  const publisherManagedPostUrls =
    mode === "edit" && initial?.status !== "DRAFT"
      ? Object.fromEntries(
          (initial?.placementPostIds ?? []).map((placement) => [
            placement.telegramChannelId,
            buildTelegramPostsUrl({
              channelId: placement.telegramChannelId,
              postId: placement.managedPostId,
              postView: "editor",
            }),
          ]),
        )
      : {};
  const hasMultiplePublisherPosts = 1 + additionalPublisherPosts.length > 1;
  const publicationActions = (publicationId: string) => {
    const changed = publicationChanges[publicationId] ?? false;
    const published = publicationHasTelegramMessage[publicationId] ?? false;
    if (!initial || initial.status === "DRAFT") return null;
    return (
      <>
        {canUpdatePublicationInTelegram({ changed, published }) ? (
          <Button
            type="button"
            disabled={saving || savingDraft}
            onClick={() => onUpdatePublicationInTelegram?.(publicationId)}
          >
            {published ? "Update in all channels" : "Update scheduled posts"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          disabled={saving || savingDraft}
          onClick={() => onReplacePublicationAndPublishNow?.(publicationId)}
        >
          {published ? "Delete and publish now" : "Publish now"}
        </Button>
      </>
    );
  };
  const publicationChannelActions = (publicationId: string) =>
    buildCrossPromotionChannelActions({
      channelIds: publisherIds,
      placements: initial?.placementPostIds ?? [],
      publicationId,
      onUpdate: onUpdatePublicationChannelSchedule,
      onReplace: onReplacePublicationChannelSchedule,
    });
  const importPost = async (target: string) => {
    const previousTarget = botFlowTarget;
    setBotFlowTarget(target);
    if (botTargetStorageKey) window.localStorage.setItem(botTargetStorageKey, target);
    const started = await botFlow.startImport();
    // A cancelled Replace dialog must leave the spinner on the actual active
    // post, rather than moving it to the button the user just clicked.
    if (!started) {
      setBotFlowTarget(previousTarget);
      if (botTargetStorageKey) {
        if (previousTarget) {
          window.localStorage.setItem(botTargetStorageKey, previousTarget);
        } else {
          window.localStorage.removeItem(botTargetStorageKey);
        }
      }
    }
  };
  const sendPost = (target: "post" | "outbound", targetIndex?: number) => {
    setBotFlowTarget(target);
    if (target === "post") {
      void botFlow.send(post);
      return;
    }
    const preview = resolveOutboundPreview(targetIndex);
    if (preview) void botFlow.send(preview);
  };
  const actions = (
    <CrossPromotionPlanActions
      status={initial?.status}
      mode={mode}
      saving={saving}
      savingDraft={savingDraft}
      hasMultiplePublisherPosts={hasMultiplePublisherPosts}
      hasTitle={Boolean(title.trim())}
      sharedPublicationChanged={sharedPublicationChanged}
      requiresRepublish={requiresRepublish}
      onClose={onClose}
      onSaveDraft={onSaveDraft}
      onUpdateDetails={onUpdateDetails}
      onReplaceAndPublishNow={onReplaceAndPublishNow}
      onSubmit={onSubmit}
    />
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={crossPromotionModalTitle(mode, kind)}
      leadingHeaderAction={
        onBack && !saving && !savingDraft ? <ModalBackButton label="Back to promotion types" onClick={onBack} /> : null
      }
      size="xl"
      extraViewportSpace
      compactTitle
      footer={mode === "create" && !loading && (initial || !drafts.pendingDrafts.length) ? actions : undefined}
    >
      {loading ? (
        <LoadingState />
      ) : !initial && drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          titleFor={(draft) => draft.title.trim() || "Unfinished promotion placement"}
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_224px] lg:items-start xl:grid-cols-[minmax(0,1fr)_256px]">
        <div className="min-w-0 space-y-4">
          <section className="space-y-4 rounded-xl border border-neutral-800 p-3 sm:p-4">
            <h3 className="flex items-center gap-3 font-semibold text-white"><FormSectionNumber>1</FormSectionNumber>Promotion details</h3>
            <CrossPromotionIdentityStep
              kind={kind}
              iconId={iconId}
              iconPresentation={iconPresentation}
              title={title}
              partnerContact={partnerContact}
              partnerTelegram={partnerTelegram}
              partnerAdvertiserId={partnerAdvertiserId}
              selectedClient={initial?.advertiser ?? null}
              onIconChange={(value, presentation) => {
                setIconId(value);
                setIconPresentation(presentation);
              }}
              onTitleChange={(value) => {
                autoTitle.current = null;
                setTitle(value);
              }}
              onContactChange={setPartnerContact}
              onTelegramChange={setPartnerTelegram}
              onAdvertiserChange={(advertiser) => setPartnerAdvertiserId(advertiser?.id ?? null)}
              onSearchAdvertisers={searchAdvertisers}
            />
          </section>
          <section className="space-y-4 rounded-xl border border-neutral-800 p-3 sm:p-4">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={mySideOpen}
              onClick={() => setMySideOpen((current) => !current)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <FormSectionNumber>2</FormSectionNumber>
                <span>
                  <span className="block font-semibold text-white">My side</span>
                </span>
              </span>
              <ChevronDown
                size={18}
                className={`mt-0.5 shrink-0 text-neutral-400 transition-transform ${mySideOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {mySideOpen ? (
              <>
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
                  channelsPlaceholder="Channels for partner posts"
                  channelsPlaceholderClassName="truncate text-[11px] sm:text-sm"
                />
                {publisherIds.length ? (
                  <>
                    {kind === "DIRECT_MUTUAL" ? (
                      <>
                        <section className="space-y-3 border-t border-neutral-800 pt-3 sm:rounded-xl sm:border sm:p-3">
                          <div className="relative flex items-center justify-between gap-2 pr-8">
                            <div>
                              <h4 className="text-sm font-semibold text-white">Partner post 1</h4>
                            </div>
                            <div className="flex items-center gap-1">{publicationActions("publisher-1")}</div>
                            <button
                              type="button"
                              className="absolute right-0 top-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                              aria-label="Toggle partner post 1"
                              aria-expanded={publisherPostOpen.primary ?? true}
                              onClick={() =>
                                setPublisherPostOpen((current) => ({
                                  ...current,
                                  primary: !(current.primary ?? true),
                                }))
                              }
                            >
                              <ChevronDown
                                size={17}
                                className={`transition-transform ${(publisherPostOpen.primary ?? true) ? "rotate-180" : ""}`}
                              />
                            </button>
                          </div>
                          {(publisherPostOpen.primary ?? true) ? (
                            <>
                              <CrossPromotionPlacementSettings
                                title="Slots for this post"
                                channelIds={publisherIds}
                                channels={allChannels}
                                productsByChannelId={productsByChannelId}
                                value={publisherSettings}
                                defaultDate={date}
                                defaultTime={time}
                                onDefaultDateChange={setDate}
                                onChange={setPublisherSettings}
                                showAdSlots
                                managedPostUrls={publisherManagedPostUrls}
                                placementActions={publicationChannelActions("publisher-1")}
                              />
                              <CrossPromotionPublicationPostEditor
                                hideHeading
                                directMutual
                                post={post}
                                publishingChannel={allChannels.find((channel) => channel.id === publisherIds[0])}
                                botConnected={botConnected}
                                importStatus={postStatus.importStatus}
                                sendStatus={postStatus.sendStatus}
                                dots={postStatus.dots}
                                onImport={() => importPost("post")}
                                onSend={() => sendPost("post")}
                                onUseSelectedPromo={() => undefined}
                                onChange={setPost}
                                publishedMediaCount={
                                  clearedPublisherPosts.primary ? undefined : publishedPrimaryMediaCount
                                }
                                onClear={() => {
                                  setPost(emptyCrossPromotionPost());
                                  setClearedPublisherPosts((current) => ({
                                    ...current,
                                    primary: true,
                                  }));
                                }}
                              />
                            </>
                          ) : null}
                        </section>
                        {additionalPublisherPosts.map((publication, index) => (
                          <section
                            key={publication.id}
                            className="space-y-3 border-t border-neutral-800 pt-3 sm:rounded-xl sm:border sm:p-3"
                          >
                            <div className="relative flex items-center justify-between gap-2 pr-8">
                              <span>
                                <h4 className="text-sm font-semibold text-white">Partner post {index + 2}</h4>
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="danger"
                                  aria-label={`Remove partner post ${index + 2}`}
                                  onClick={() =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.filter((item) => item.id !== publication.id),
                                    )
                                  }
                                >
                                  <Trash2 size={16} />
                                </Button>
                                {publicationActions(publication.id)}
                              </div>
                              <button
                                type="button"
                                className="absolute right-0 top-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                                aria-label={`Toggle partner post ${index + 2}`}
                                aria-expanded={publisherPostOpen[publication.id] ?? true}
                                onClick={() =>
                                  setPublisherPostOpen((current) => ({
                                    ...current,
                                    [publication.id]: !(current[publication.id] ?? true),
                                  }))
                                }
                              >
                                <ChevronDown
                                  size={17}
                                  className={`transition-transform ${(publisherPostOpen[publication.id] ?? true) ? "rotate-180" : ""}`}
                                />
                              </button>
                            </div>
                            {(publisherPostOpen[publication.id] ?? true) ? (
                              <>
                                <CrossPromotionPlacementSettings
                                  title="Slots for this post"
                                  channelIds={publisherIds}
                                  channels={allChannels}
                                  productsByChannelId={productsByChannelId}
                                  value={publication.settings}
                                  defaultDate={publication.settings.dates?.[publisherIds[0] ?? ""] ?? date}
                                  defaultTime={time}
                                  onDefaultDateChange={(nextDate) =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.map((item) =>
                                        item.id === publication.id
                                          ? {
                                              ...item,
                                              settings: {
                                                ...item.settings,
                                                dates: Object.fromEntries(
                                                  publisherIds.map((channelId) => [channelId, nextDate]),
                                                ),
                                              },
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  onChange={(settings) =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.map((item) =>
                                        item.id === publication.id ? { ...item, settings } : item,
                                      ),
                                    )
                                  }
                                  showAdSlots
                                  placementActions={publicationChannelActions(publication.id)}
                                />
                                <CrossPromotionPublicationPostEditor
                                  hideHeading
                                  directMutual
                                  post={publication.post}
                                  publishingChannel={allChannels.find((channel) => channel.id === publisherIds[0])}
                                  botConnected={botConnected}
                                  importStatus={publisherPostStatus(publication.id).importStatus}
                                  sendStatus={publisherPostStatus(publication.id).sendStatus}
                                  dots={publisherPostStatus(publication.id).dots}
                                  onImport={() => void importPost(`publisher:${publication.id}`)}
                                  onSend={() => onSendPublisherPost(publication.id, publication.post)}
                                  onUseSelectedPromo={() => undefined}
                                  onChange={(nextPost) =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.map((item) =>
                                        item.id === publication.id ? { ...item, post: nextPost } : item,
                                      ),
                                    )
                                  }
                                  onClear={() => {
                                    setAdditionalPublisherPosts((current) =>
                                      current.map((item) =>
                                        item.id === publication.id
                                          ? {
                                              ...item,
                                              post: emptyCrossPromotionPost(),
                                            }
                                          : item,
                                      ),
                                    );
                                    setClearedPublisherPosts((current) => ({
                                      ...current,
                                      [publication.id]: true,
                                    }));
                                  }}
                                  publishedMediaCount={
                                    clearedPublisherPosts[publication.id]
                                      ? undefined
                                      : initial?.status === "ACTIVE"
                                        ? normalizeTelegramPostMediaItems(
                                            initial.publicationPost.publisherPublications?.[index + 1]?.post
                                              .mediaItems ?? [],
                                            initial.publicationPost.publisherPublications?.[index + 1]?.post
                                              .imageUrls ?? [],
                                          ).length
                                        : undefined
                                  }
                                />
                              </>
                            ) : null}
                          </section>
                        ))}
                        <Button
                          type="button"
                          onClick={() =>
                            setAdditionalPublisherPosts((current) => [
                              ...current,
                              {
                                id: crypto.randomUUID(),
                                post: {
                                  title: "",
                                  text: "",
                                  imageUrls: [],
                                  buttonRows: [],
                                },
                                settings: { formatIds: {}, times: {} },
                              },
                            ])
                          }
                        >
                          <Plus size={15} /> Add partner post
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
                {!publisherIds.length && kind === "DIRECT_MUTUAL" ? (
                  <CrossPromotionPublicationPostEditor
                    directMutual
                    post={post}
                    publishingChannel={undefined}
                    botConnected={botConnected}
                    importStatus={postStatus.importStatus}
                    sendStatus={postStatus.sendStatus}
                    dots={postStatus.dots}
                    onImport={() => importPost("post")}
                    onSend={() => sendPost("post")}
                    onUseSelectedPromo={() => undefined}
                    onChange={setPost}
                  />
                ) : null}
              </>
            ) : null}
            {mySideOpen && kind === "OWN_CHANNELS" ? (
              <CrossPromotionPublicationPostEditor
                directMutual={false}
                post={post}
                publishingChannel={allChannels.find((channel) => channel.id === publisherIds[0])}
                botConnected={botConnected}
                importStatus={postStatus.importStatus}
                sendStatus={postStatus.sendStatus}
                dots={postStatus.dots}
                onImport={() => importPost("post")}
                onSend={() => sendPost("post")}
                onUseSelectedPromo={() => {
                  const selectedPost = resolveOutboundPreview(0);
                  if (selectedPost) setPost(selectedPost);
                }}
                onChange={setPost}
              />
            ) : null}
          </section>
          <section className="space-y-4 rounded-xl border border-neutral-800 p-3 sm:p-4">
            {kind === "DIRECT_MUTUAL" ? (
              <CrossPromotionPartnerSide
                expanded={partnerSideOpen}
                onExpandedChange={setPartnerSideOpen}
                showPartnerIdentity={false}
                channels={allChannels}
                ownChannels={ownChannels}
                partnerIds={partnerIds}
                onPartnerIdsChange={setPartnerIds}
                partnerAdvertiserId={partnerAdvertiserId}
                partnerClient={initial?.advertiser ?? null}
                partnerContact={partnerContact}
                onPartnerContactChange={setPartnerContact}
                onPartnerTelegramChange={setPartnerTelegram}
                onPartnerAdvertiserChange={(advertiser) => setPartnerAdvertiserId(advertiser?.id ?? null)}
                onSearchAdvertisers={searchAdvertisers}
                productsByChannelId={productsByChannelId}
                settings={partnerSettings}
                defaultDate={partnerDate}
                onDefaultDateChange={setPartnerDate}
                defaultTime={time}
                onSettingsChange={setPartnerSettings}
                targets={targets}
                onTargetsChange={setTargets}
                onAddTarget={() => {
                  const source = targets.at(-1) ?? targets[0];
                  const channelId = source?.telegramChannelId ?? ownChannels[0]?.id;
                  if (!channelId) return;
                  setTargets((current) => [
                    ...current,
                    {
                      telegramChannelId: channelId,
                      promoId: outboundMode === "CUSTOM" ? null : (source?.promoId ?? ""),
                      inviteLinkId: source?.inviteLinkId ?? "",
                    },
                  ]);
                }}
                onResolved={(channelId, resolved) => {
                  resolvedTargets.current.set(channelId, resolved);
                  if (channelId === "target:0") suggestTitleFromTrackingLink(resolved.inviteLink);
                }}
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
                botConnected={botConnected}
                importStatus={outboundStatus.importStatus}
                sendStatus={outboundStatus.sendStatus}
                onImportPost={() => importPost("outbound")}
                onSendPost={(targetIndex) => sendPost("outbound", targetIndex)}
                promoReady={promoReady}
                showValidationErrors={showValidationErrors}
              />
            ) : null}
            {kind === "OWN_CHANNELS" ? (
              <CrossPromotionOwnTargets
                channels={ownChannels}
                publisherIds={publisherIds}
                targetIds={targetIds}
                date={date}
                time={time}
                onDateChange={setDate}
                onTimeChange={setTime}
                targets={targets}
                onTargetIdsChange={updateTargetIds}
                onTargetsChange={setTargets}
                onResolved={(channelId, resolved) => resolvedTargets.current.set(channelId, resolved)}
              />
            ) : null}
          </section>
          {error || botFlow.error ? <FormError message={error || botFlow.error} /> : null}
          {mode === "edit" ? actions : null}
        </div>
        <CrossPromotionPlanSummary
          kind={kind}
          publisherIds={publisherIds}
          publisherSettings={publisherSettings}
          additionalPublisherPosts={additionalPublisherPosts}
          partnerIds={partnerIds}
          partnerSettings={partnerSettings}
          productsByChannelId={productsByChannelId}
          initial={initial}
        />
        </div>
      )}
    </Modal>
  );
}
