"use client";

import { useState, type MutableRefObject } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type {
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  TelegramAdProduct,
  TelegramAdvertiser,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import type {
  Promo,
  TelegramChannel,
  TelegramChannelNetwork,
  TelegramInviteLinkOption,
} from "@/lib/api";
import {
  Button,
  FormError,
  FormField,
  Input,
  LoadingState,
  Modal,
  Tooltip,
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
  onSaveDraft,
  state,
  allChannels,
  ownChannels,
  partnerChannels,
  ownNetworks,
  productsByChannelId,
  targetIds,
  updateTargetIds,
  botConnected,
  botFlow,
  botFlowTarget,
  setBotFlowTarget,
  botTargetStorageKey,
  partnerImport,
  resolvedTargets,
  basicsReady,
  promoReady,
  searchAdvertisers,
  resolveOutboundPreview,
  onSendPublisherPost,
  showValidationErrors,
  sharedPublicationChanged,
  requiresRepublish,
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
  onSaveDraft: () => void;
  state: DraftState;
  allChannels: TelegramChannel[];
  ownChannels: TelegramChannel[];
  partnerChannels: TelegramChannel[];
  ownNetworks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  targetIds: string[];
  updateTargetIds: (ids: string[]) => void;
  botConnected: boolean;
  botFlow: BotFlow;
  botFlowTarget: string;
  setBotFlowTarget: (target: string) => void;
  botTargetStorageKey?: string;
  partnerImport: {
    importing: boolean;
    importReferences: (input: string) => void | Promise<void>;
  };
  resolvedTargets: MutableRefObject<
    Map<string, { promo?: Promo; inviteLink?: TelegramInviteLinkOption }>
  >;
  basicsReady: boolean;
  promoReady: boolean;
  searchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  resolveOutboundPreview: (
    targetIndex?: number,
  ) => TelegramSystemBotPostDraft | undefined;
  onSendPublisherPost: (id: string, post: TelegramSystemBotPostDraft) => void;
  showValidationErrors: boolean;
  sharedPublicationChanged: boolean;
  requiresRepublish: boolean;
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
    setPartnerIds,
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
  const publishedPrimaryMediaCount =
    initial?.status === "ACTIVE"
      ? normalizeTelegramPostMediaItems(
          initial.publicationPost.publisherPublications?.[0]?.post.mediaItems ??
            initial.publicationPost.mediaItems,
          initial.publicationPost.publisherPublications?.[0]?.post.imageUrls ??
            initial.publicationPost.imageUrls,
        ).length
      : undefined;
  const postStatus =
    botFlowTarget === "post"
      ? botFlow
      : {
          importStatus: "idle" as const,
          sendStatus: "idle" as const,
          dots: 1,
        };
  const outboundStatus =
    botFlowTarget === "outbound"
      ? botFlow
      : {
          importStatus: "idle" as const,
          sendStatus: "idle" as const,
          dots: 1,
        };
  const publisherPostStatus = (id: string) =>
    botFlowTarget === `publisher:${id}`
      ? botFlow
      : {
          importStatus: "idle" as const,
          sendStatus: "idle" as const,
          dots: 1,
        };
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
                onChange={(event) => setTitle(event.target.value)}
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
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                Partner post 1
                              </h4>
                              <p className="text-xs text-neutral-500">
                                Forward the partner&apos;s advertising post
                                through the bot or compose it manually.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
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
                            <div className="flex items-center justify-between gap-2">
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
                                <button
                                  type="button"
                                  className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
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
              partnerChannels={partnerChannels}
              ownChannels={ownChannels}
              partnerIds={partnerIds}
              onPartnerIdsChange={(ids) => {
                setPartnerIds(ids);
                if (!ids.length) setTargets([]);
              }}
              partnerAdvertiserId={partnerAdvertiserId}
              partnerClient={initial?.advertiser ?? null}
              partnerContact={partnerContact}
              onPartnerContactChange={setPartnerContact}
              onPartnerTelegramChange={setPartnerTelegram}
              onPartnerAdvertiserChange={(advertiser) =>
                setPartnerAdvertiserId(advertiser?.id ?? null)
              }
              onSearchAdvertisers={searchAdvertisers}
              importingChannel={partnerImport.importing}
              onImportChannel={partnerImport.importReferences}
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
              botConnected={botConnected}
              importStatus={outboundStatus.importStatus}
              sendStatus={outboundStatus.sendStatus}
              onImportPost={() => importPost("outbound")}
              onSendPost={(targetIndex) => sendPost("outbound", targetIndex)}
              promoReady={promoReady}
              showValidationErrors={showValidationErrors}
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
          {error || botFlow.error ? (
            <FormError message={error || botFlow.error} />
          ) : null}
          {sharedPublicationChanged ? (
            <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              The shared partner post has changed. Updating this promotion will
              update that post in every linked Telegram channel.
            </div>
          ) : null}
          {requiresRepublish ? (
            <div className="rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              This published post did not have an inline button. Adding one
              requires publishing a new Telegram message, so use Delete and
              publish now instead of Update mutual promotion.
            </div>
          ) : null}
          {mode === "edit" && initial?.status === "SCHEDULED" ? (
            <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
              Replacing scheduled posts deletes the current scheduled Telegram
              posts in every linked channel, then creates this version at the
              selected dates and times.
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {!initial || initial.status === "DRAFT" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving || savingDraft}
                onClick={onSaveDraft}
              >
                {savingDraft
                  ? initial?.status === "DRAFT"
                    ? "Updating draft…"
                    : "Saving draft…"
                  : initial?.status === "DRAFT"
                    ? "Update draft"
                    : "Save draft"}
              </Button>
            ) : null}
            {onReplaceAndPublishNow ? (
              <Tooltip
                content={
                  initial?.status === "DRAFT"
                    ? "No live publication was found. Publish this draft to every selected channel now."
                    : "Need a completely new post? Delete the current publication in all linked channels and publish this version immediately."
                }
              >
                <span>
                  <Button
                    type="button"
                    variant={initial?.status === "DRAFT" ? "primary" : "danger"}
                    className="w-full sm:w-auto"
                    disabled={saving || savingDraft}
                    onClick={onReplaceAndPublishNow}
                  >
                    {initial?.status === "DRAFT"
                      ? "Publish now"
                      : "Delete and publish now"}
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            {initial?.status !== "DRAFT" ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={saving || savingDraft || requiresRepublish}
                onClick={onSubmit}
              >
                {saving
                  ? mode === "edit"
                    ? "Updating…"
                    : "Scheduling…"
                  : mode === "edit"
                    ? initial?.status === "SCHEDULED"
                      ? "Replace scheduled posts"
                      : requiresRepublish
                        ? "Republish required"
                        : "Update mutual promotion"
                    : "Create and schedule"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
