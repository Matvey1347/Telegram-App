"use client";

import { useState, type MutableRefObject } from "react";
import { ChevronDown } from "lucide-react";
import type {
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  TelegramAdProduct,
  TelegramAdvertiser,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import type {
  Promo,
  TelegramChannel,
  TelegramChannelNetwork,
  TelegramInviteLink,
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

type DraftState = ReturnType<typeof useCrossPromotionDraftState>;
type BotFlow = ReturnType<typeof useTelegramSystemBotPostFlow<"single">>;

export function CrossPromotionPlanView({
  open,
  kind,
  initial,
  mode,
  loading,
  saving,
  onClose,
  onSubmit,
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
  useResolvedPromo,
  basicsReady,
  promoReady,
  placementSettingsReady,
  searchAdvertisers,
  resolveOutboundPreview,
}: {
  open: boolean;
  kind: CrossPromotionPlanKind;
  initial: CrossPromotionPlan | null;
  mode: CrossPromotionModalMode;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
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
  botFlowTarget: "post" | "outbound";
  setBotFlowTarget: (target: "post" | "outbound") => void;
  botTargetStorageKey?: string;
  partnerImport: {
    importing: boolean;
    importReferences: (input: string) => void | Promise<void>;
  };
  resolvedTargets: MutableRefObject<
    Map<string, { promo?: Promo; inviteLink?: TelegramInviteLink }>
  >;
  useResolvedPromo: () => void;
  basicsReady: boolean;
  promoReady: boolean;
  placementSettingsReady: boolean;
  searchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  resolveOutboundPreview: () => TelegramSystemBotPostDraft | undefined;
}) {
  const [mySideOpen, setMySideOpen] = useState(true);
  const [partnerSideOpen, setPartnerSideOpen] = useState(true);
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
  const postStatus =
    botFlowTarget === "post"
      ? botFlow
      : { importStatus: "idle" as const, sendStatus: "idle" as const };
  const outboundStatus =
    botFlowTarget === "outbound"
      ? botFlow
      : { importStatus: "idle" as const, sendStatus: "idle" as const };
  const importPost = (target: "post" | "outbound") => {
    setBotFlowTarget(target);
    if (botTargetStorageKey)
      window.localStorage.setItem(botTargetStorageKey, target);
    void botFlow.startImport();
  };
  const sendPost = (target: "post" | "outbound") => {
    setBotFlowTarget(target);
    if (target === "post") {
      void botFlow.send(post);
      return;
    }
    const preview = resolveOutboundPreview();
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
                      showAdSlots
                    />
                    {kind === "DIRECT_MUTUAL" ? (
                      <CrossPromotionPublicationPostEditor
                        directMutual
                        post={post}
                        publishingChannel={allChannels.find(
                          (channel) => channel.id === publisherIds[0],
                        )}
                        botConnected={botConnected}
                        importStatus={postStatus.importStatus}
                        sendStatus={postStatus.sendStatus}
                        onImport={() => importPost("post")}
                        onSend={() => sendPost("post")}
                        onUseSelectedPromo={useResolvedPromo}
                        onChange={setPost}
                      />
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
              onPartnerIdsChange={setPartnerIds}
              partnerAdvertiserId={partnerAdvertiserId}
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
              botConnected={botConnected}
              importStatus={outboundStatus.importStatus}
              sendStatus={outboundStatus.sendStatus}
              onImportPost={() => importPost("outbound")}
              onSendPost={() => sendPost("outbound")}
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
              botConnected={botConnected}
              importStatus={postStatus.importStatus}
              sendStatus={postStatus.sendStatus}
              onImport={() => importPost("post")}
              onSend={() => sendPost("post")}
              onUseSelectedPromo={useResolvedPromo}
              onChange={setPost}
            />
          ) : null}
          {error || botFlow.error ? (
            <FormError message={error || botFlow.error} />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onSubmit}>
              {saving
                ? mode === "edit"
                  ? "Updating…"
                  : "Scheduling…"
                : mode === "edit"
                  ? "Update mutual promotion"
                  : "Create and schedule"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
