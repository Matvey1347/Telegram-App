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
import type {
  Promo,
  TelegramChannel,
  TelegramInviteLinkOption,
} from "@/lib/api";
import {
  Button,
  FormError,
  FormField,
  Input,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import type { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { CrossPromotionPlacementSettings } from "./cross-promotion-placement-settings";
import { CrossPromotionPartnerSide } from "./cross-promotion-partner-side";
import { CrossPromotionOwnTargets } from "./cross-promotion-own-targets";
import { CrossPromotionPublicationPostEditor } from "./cross-promotion-publication-post-editor";
import type { useCrossPromotionDraftState } from "./use-cross-promotion-draft-state";
import {
  crossPromotionModalTitle,
  type CrossPromotionModalMode,
} from "./cross-promotion-modal-title";
import { emptyCrossPromotionPost } from "./cross-promotion-plan-draft";
import { CrossPromotionPlanActions } from "./cross-promotion-plan-actions";
import { canUpdatePublicationInTelegram } from "./cross-promotion-publication-actions";

type DraftState = ReturnType<typeof useCrossPromotionDraftState>;
type BotFlow = ReturnType<typeof useTelegramSystemBotPostFlow<"single">>;

export function CrossPromotionPlanView({
  open,
  kind,
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
  onUpdatePublicationChannelSchedule?: (
    publicationId: string,
    channelId: string,
  ) => void;
  onReplacePublicationChannelSchedule?: (
    publicationId: string,
    channelId: string,
  ) => void;
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
  botFlow: BotFlow;
  botFlowTarget: string;
  setBotFlowTarget: (target: string) => void;
  botTargetStorageKey?: string;
  resolvedTargets: MutableRefObject<
    Map<string, { promo?: Promo; inviteLink?: TelegramInviteLinkOption }>
  >;
  promoReady: boolean;
  searchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  resolveOutboundPreview: (
    targetIndex?: number,
  ) => TelegramSystemBotPostDraft | undefined;
  onSendPublisherPost: (id: string, post: TelegramSystemBotPostDraft) => void;
  showValidationErrors: boolean;
  sharedPublicationChanged: boolean;
  requiresRepublish: boolean;
  publicationChanges: Record<string, boolean>;
  publicationHasTelegramMessage: Record<string, boolean>;
}) {
  const [mySideOpen, setMySideOpen] = useState(true);
  const [partnerSideOpen, setPartnerSideOpen] = useState(true);
  const [publisherPostOpen, setPublisherPostOpen] = useState<
    Record<string, boolean>
  >({});
  const [clearedPublisherPosts, setClearedPublisherPosts] = useState<
    Record<string, boolean>
  >({});
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
    partnerAdvertiserId,
    setPartnerAdvertiserId,
    partnerContact,
    setPartnerContact,
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
    if (next) { autoTitle.current = next; setTitle(next); } };
  const publishedPrimaryMediaCount =
    initial?.status === "ACTIVE"
      ? normalizeTelegramPostMediaItems(
          initial.publicationPost.publisherPublications?.[0]?.post.mediaItems ??
            initial.publicationPost.mediaItems,
          initial.publicationPost.publisherPublications?.[0]?.post.imageUrls ??
            initial.publicationPost.imageUrls,
        ).length
      : undefined;
  const idleBotFlow = { importStatus: "idle", sendStatus: "idle", dots: 1 } as const;
  const postStatus =
    botFlowTarget === "post"
      ? botFlow
      : idleBotFlow;
  const outboundStatus =
    botFlowTarget === "outbound"
      ? botFlow
      : idleBotFlow;
  const publisherPostStatus = (id: string) =>
    botFlowTarget === `publisher:${id}`
      ? botFlow
      : idleBotFlow;
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
    Object.fromEntries(
      publisherIds.flatMap((channelId) => {
        const placement = initial?.placementPostIds.find(
          (item) =>
            item.publicationId === publicationId &&
            item.telegramChannelId === channelId,
        );
        if (!placement) return [];
        const published = Boolean(placement.isPublishedInTelegram);
        return [
          [
            channelId,
            {
              label: published
                ? "Delete current post & schedule again"
                : "Update",
              variant: published ? ("danger" as const) : ("primary" as const),
              onClick: () =>
                published
                  ? onReplacePublicationChannelSchedule?.(
                      publicationId,
                      channelId,
                    )
                  : onUpdatePublicationChannelSchedule?.(
                      publicationId,
                      channelId,
                    ),
            },
          ],
        ];
      }),
    );
  const importPost = async (target: string) => {
    const previousTarget = botFlowTarget;
    setBotFlowTarget(target);
    if (botTargetStorageKey)
      window.localStorage.setItem(botTargetStorageKey, target);
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
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : (
        <div className="min-w-0 space-y-4">
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
                onChange={(event) => { autoTitle.current = null; setTitle(event.target.value); }}
                placeholder="Mentor ↔ Partner channel"
              />
            </FormField>
          </div>
          <section className="space-y-4 border-y border-blue-900/70 py-4 sm:rounded-xl sm:border sm:bg-blue-950/10 sm:p-4">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={mySideOpen}
              onClick={() => setMySideOpen((current) => !current)}
            >
              <span>
                <h3 className="font-semibold text-white">My side</h3>
                <p className="text-xs text-neutral-400">
                  Where I publish the partner post and what it should look like.
                </p>
              </span>
              <ChevronDown
                size={18}
                className={`mt-0.5 shrink-0 text-neutral-400 transition-transform ${
                  mySideOpen ? "" : "-rotate-90"
                }`}
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
                  channelsPlaceholder="Where I publish the partner post"
                />
                {publisherIds.length ? (
                  <>
                    {kind === "DIRECT_MUTUAL" ? (
                      <>
                        <section className="space-y-3 border-t border-neutral-800 pt-3 sm:rounded-xl sm:border sm:p-3">
                          <div className="relative flex items-center justify-between gap-2 pr-8">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                Partner post 1
                              </h4>
                              <p className="text-xs text-neutral-500">
                                Forward the partner&apos;s advertising post
                                through the bot or compose it manually.
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {publicationActions("publisher-1")}
                            </div>
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
                                description="Expected views use the same channel pricing data as Ad Sale."
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
                                placementActions={publicationChannelActions(
                                  "publisher-1",
                                )}
                              />
                              <CrossPromotionPublicationPostEditor
                                title="Partner post 1"
                                directMutual
                                post={post}
                                publishingChannel={allChannels.find(
                                  (channel) => channel.id === publisherIds[0],
                                )}
                                botConnected={botConnected}
                                importStatus={postStatus.importStatus}
                                sendStatus={postStatus.sendStatus}
                                dots={postStatus.dots}
                                onImport={() => importPost("post")}
                                onSend={() => sendPost("post")}
                                onUseSelectedPromo={() => undefined}
                                onChange={setPost}
                                publishedMediaCount={
                                  clearedPublisherPosts.primary
                                    ? undefined
                                    : publishedPrimaryMediaCount
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
                                <h4 className="text-sm font-semibold text-white">
                                  Partner post {index + 2}
                                </h4>
                                <p className="text-xs text-neutral-500">
                                  A separate post with its own publication
                                  slots.
                                </p>
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="danger"
                                  aria-label={`Remove partner post ${index + 2}`}
                                  onClick={() =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.filter(
                                        (item) => item.id !== publication.id,
                                      ),
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
                                aria-expanded={
                                  publisherPostOpen[publication.id] ?? true
                                }
                                onClick={() =>
                                  setPublisherPostOpen((current) => ({
                                    ...current,
                                    [publication.id]: !(
                                      current[publication.id] ?? true
                                    ),
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
                                  description="The same channel can be selected again at another time."
                                  channelIds={publisherIds}
                                  channels={allChannels}
                                  productsByChannelId={productsByChannelId}
                                  value={publication.settings}
                                  defaultDate={
                                    publication.settings.dates?.[
                                      publisherIds[0] ?? ""
                                    ] ?? date
                                  }
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
                                                  publisherIds.map(
                                                    (channelId) => [
                                                      channelId,
                                                      nextDate,
                                                    ],
                                                  ),
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
                                        item.id === publication.id
                                          ? { ...item, settings }
                                          : item,
                                      ),
                                    )
                                  }
                                  showAdSlots
                                  placementActions={publicationChannelActions(
                                    publication.id,
                                  )}
                                />
                                <CrossPromotionPublicationPostEditor
                                  title={`Partner post ${index + 2}`}
                                  directMutual
                                  post={publication.post}
                                  publishingChannel={allChannels.find(
                                    (channel) => channel.id === publisherIds[0],
                                  )}
                                  botConnected={botConnected}
                                  importStatus={
                                    publisherPostStatus(publication.id)
                                      .importStatus
                                  }
                                  sendStatus={
                                    publisherPostStatus(publication.id)
                                      .sendStatus
                                  }
                                  dots={
                                    publisherPostStatus(publication.id).dots
                                  }
                                  onImport={() =>
                                    void importPost(
                                      `publisher:${publication.id}`,
                                    )
                                  }
                                  onSend={() =>
                                    onSendPublisherPost(
                                      publication.id,
                                      publication.post,
                                    )
                                  }
                                  onUseSelectedPromo={() => undefined}
                                  onChange={(nextPost) =>
                                    setAdditionalPublisherPosts((current) =>
                                      current.map((item) =>
                                        item.id === publication.id
                                          ? { ...item, post: nextPost }
                                          : item,
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
                                            initial.publicationPost
                                              .publisherPublications?.[
                                              index + 1
                                            ]?.post.mediaItems ?? [],
                                            initial.publicationPost
                                              .publisherPublications?.[
                                              index + 1
                                            ]?.post.imageUrls ?? [],
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
              </>
            ) : null}
          </section>
          {kind === "DIRECT_MUTUAL" ? (
            <CrossPromotionPartnerSide
              expanded={partnerSideOpen}
              onExpandedChange={setPartnerSideOpen}
              channels={allChannels}
              ownChannels={ownChannels}
              partnerIds={partnerIds}
              partnerAdvertiserId={partnerAdvertiserId}
              partnerClient={initial?.advertiser ?? null}
              partnerContact={partnerContact}
              onPartnerContactChange={setPartnerContact}
              onPartnerTelegramChange={setPartnerTelegram}
              onPartnerAdvertiserChange={(advertiser) =>
                setPartnerAdvertiserId(advertiser?.id ?? null)
              }
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
                const channelId =
                  source?.telegramChannelId ?? ownChannels[0]?.id;
                if (!channelId) return;
                setTargets((current) => [
                  ...current,
                  {
                    telegramChannelId: channelId,
                    promoId:
                      outboundMode === "CUSTOM"
                        ? null
                        : (source?.promoId ?? ""),
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
              onResolved={(channelId, resolved) =>
                resolvedTargets.current.set(channelId, resolved)
              }
            />
          ) : null}
          {error || botFlow.error ? (
            <FormError message={error || botFlow.error} />
          ) : null}
          <CrossPromotionPlanActions status={initial?.status} mode={mode} saving={saving} savingDraft={savingDraft} hasMultiplePublisherPosts={hasMultiplePublisherPosts} hasTitle={Boolean(title.trim())} sharedPublicationChanged={sharedPublicationChanged} requiresRepublish={requiresRepublish} onClose={onClose} onSaveDraft={onSaveDraft} onUpdateDetails={onUpdateDetails} onReplaceAndPublishNow={onReplaceAndPublishNow} onSubmit={onSubmit} />
        </div>
      )}
    </Modal>
  );
}
