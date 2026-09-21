"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Save } from "lucide-react";
import type {
  TelegramChannelMessageTemplate,
  TelegramChannelMessageTemplatePayload,
  TelegramMessageTemplatePriceRounding,
  ResolvedEmoji,
} from "@telegram-system/shared";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { telegramSystemBotApi } from "@/lib/api";
import { Button, Card, ErrorState } from "@/components/ui/primitives";
import { TelegramPostPreview } from "./telegram-post-preview";
import {
  readTelegramChannelMessageTemplateLayout,
  renderTelegramChannelMessageTemplate,
} from "./telegram-channel-message-template-format";
import {
  TelegramChannelMessageTemplateEditorHeader,
  TelegramChannelMessageTemplateEditorTabs,
  type TelegramChannelMessageTemplateEditorSection,
} from "./telegram-channel-message-template-editor-tabs";
import {
  emptyTelegramMessageTemplatePayload,
  type TelegramChannelMessageTemplateDraftForm,
} from "./telegram-channel-message-template-draft";
import type {
  WorkspaceDraftPreview,
  WorkspaceFormDraft,
} from "@/lib/workspace-modal-drafts";
import {
  telegramChannelMessageTemplatesApi,
  telegramMessageTemplateKeys,
} from "@/lib/features/telegram/telegram-channel-message-templates-api";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramChannelMessageTemplateSettings } from "./telegram-channel-message-template-settings";
import { TelegramChannelMessageTemplatePreviewSkeleton } from "./telegram-channel-message-template-preview-skeleton";
import { useTelegramChannelMessageTemplatePriceMode } from "./use-telegram-channel-message-template-price-mode";

export function TelegramChannelMessageTemplateEditor({
  channels,
  networks,
  initial,
  onDraftChange,
  onClearDraft,
  onBack,
  onSaved,
}: {
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  initial?:
    | TelegramChannelMessageTemplate
    | WorkspaceFormDraft<TelegramChannelMessageTemplateDraftForm>;
  onDraftChange: (
    value: TelegramChannelMessageTemplateDraftForm,
    preview: WorkspaceDraftPreview,
  ) => void;
  onClearDraft: () => void;
  onBack: () => void;
  onSaved: () => void;
}) {
  const sourceForm = initial
    ? "form" in initial
      ? initial.form.payload
      : initial
    : emptyTelegramMessageTemplatePayload();
  const savedTemplateId = initial
    ? "form" in initial
      ? initial.form.savedTemplateId
      : initial.id
    : null;
  const [title, setTitle] = useState(sourceForm.title || "");
  const [iconId, setIconId] = useState(sourceForm.iconId || "");
  const [iconPresentation, setIconPresentation] =
    useState<ResolvedEmoji | null>(
      initial
        ? "form" in initial
          ? (initial.preview?.icon ?? null)
          : (initial.iconPresentation ?? null)
        : null,
    );
  const [mode, setMode] = useState<"network" | "channels">(
    sourceForm.scopeMode === "NETWORK" ? "network" : "channels",
  );
  const [networkId, setNetworkId] = useState(
    sourceForm.networkId ||
      (sourceForm.scopeMode === "NETWORK"
        ? networks.find((network) => network.isSystem)?.id || ""
        : ""),
  );
  const [channelIds, setChannelIds] = useState(
    sourceForm.scopeMode === "CHANNELS" ? sourceForm.channelIds : [],
  );
  const [channelOrderIds, setChannelOrderIds] = useState(sourceForm.channelIds);
  const [groupChannels, setGroupChannels] = useState(sourceForm.groupChannels ?? false);
  const [channelGroupLabels, setChannelGroupLabels] = useState(sourceForm.channelGroupLabels ?? {});
  const [activeSection, setActiveSection] =
    useState<TelegramChannelMessageTemplateEditorSection>("details");
  const [layout, setLayout] = useState(() =>
    readTelegramChannelMessageTemplateLayout(sourceForm.bodyTemplate),
  );
  const { bodyTemplate, priceMode, setPriceMode } =
    useTelegramChannelMessageTemplatePriceMode(sourceForm.bodyTemplate, layout);
  const [overrideInviteLinks, setOverrideInviteLinks] = useState(
    sourceForm.overrideInviteLinks,
  );
  const [inviteLinkOverrides, setInviteLinkOverrides] = useState(
    sourceForm.inviteLinkOverrides,
  );
  const [excludedProductNames, setExcludedProductNames] = useState(
    sourceForm.excludedProductNames ?? [],
  );
  const [priceRounding, setPriceRounding] =
    useState<TelegramMessageTemplatePriceRounding>(
      sourceForm.priceRounding ?? "NONE",
    );
  const [productNameOverrides, setProductNameOverrides] = useState(
    sourceForm.productNameOverrides ?? {},
  );
  const [bundleOfferEnabled, setBundleOfferEnabled] = useState(
    sourceForm.bundleOfferEnabled ?? false,
  );
  const [bundleDiscountPercent, setBundleDiscountPercent] = useState(
    sourceForm.bundleDiscountPercent ?? 10,
  );
  const [bundleBasePriceOverrides, setBundleBasePriceOverrides] = useState(
    sourceForm.bundleBasePriceOverrides ?? {},
  );
  const [sendError, setSendError] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const selectedNetwork = networks.find((network) => network.id === networkId);
  const resolvedChannelIds = useMemo(() => {
    const valid = new Set(channels.map((channel) => channel.id));
    const selectedIds = mode === "channels"
      ? channelIds
      : (selectedNetwork?.channels || []).map((channel) => channel.id);
    const available = new Set(selectedIds.filter((id) => valid.has(id)));
    return [...new Set([
      ...channelOrderIds.filter((id) => available.has(id)),
      ...selectedIds.filter((id) => available.has(id)),
    ])];
  }, [channelIds, channelOrderIds, channels, mode, selectedNetwork]);

  useEffect(() => {
    if (mode !== "network" || networkId) return;
    const systemNetwork = networks.find((network) => network.isSystem);
    // Restore the virtual All network after its query arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (systemNetwork) setNetworkId(systemNetwork.id);
  }, [mode, networkId, networks]);
  const stableSourceIds = useMemo(
    () => [...new Set(resolvedChannelIds)].sort(),
    [resolvedChannelIds],
  );
  const payload = useMemo<TelegramChannelMessageTemplatePayload>(
    () => ({
      title: title.trim() || null,
      iconId: iconId || null,
      scopeMode: mode === "network" ? "NETWORK" : "CHANNELS",
      networkId:
        mode === "network" && !selectedNetwork?.isSystem
          ? networkId || null
          : null,
      channelIds: resolvedChannelIds,
      groupChannels,
      channelGroupLabels,
      bodyTemplate,
      overrideInviteLinks,
      inviteLinkOverrides,
      excludedProductNames,
      priceRounding,
      productNameOverrides,
      bundleOfferEnabled,
      bundleDiscountPercent,
      bundleBasePriceOverrides,
    }),
    [
      bodyTemplate,
      bundleBasePriceOverrides,
      bundleDiscountPercent,
      bundleOfferEnabled,
      excludedProductNames,
      groupChannels,
      channelGroupLabels,
      iconId,
      inviteLinkOverrides,
      mode,
      networkId,
      overrideInviteLinks,
      priceRounding,
      productNameOverrides,
      selectedNetwork?.isSystem,
      resolvedChannelIds,
      title,
    ],
  );
  const sourceQuery = useQuery({
    queryKey: telegramMessageTemplateKeys.source(stableSourceIds),
    queryFn: () => telegramChannelMessageTemplatesApi.source(stableSourceIds),
    enabled: stableSourceIds.length > 0,
    staleTime: 30_000,
  });
  const orderedSourceChannels = useMemo(() => {
    const byId = new Map((sourceQuery.data?.channels || []).map((channel) => [channel.id, channel]));
    return resolvedChannelIds.flatMap((id) => {
      const channel = byId.get(id);
      return channel ? [channel] : [];
    });
  }, [resolvedChannelIds, sourceQuery.data?.channels]);
  const availableProductNames = useMemo(
    () =>
      [
        ...new Set(
          (sourceQuery.data?.channels ?? []).flatMap((channel) =>
            channel.products.map((product) => product.name),
          ),
        ),
      ].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      ),
    [sourceQuery.data?.channels],
  );
  const renderedText = useMemo(
    () =>
      renderTelegramChannelMessageTemplate(
        bodyTemplate,
        orderedSourceChannels,
        {
          channelOrder: resolvedChannelIds,
          groupChannels,
          channelGroupLabels,
          overrideInviteLinks,
          inviteLinkOverrides,
          excludedProductNames,
          priceRounding,
          productNameOverrides,
          bundleOfferEnabled,
          bundleDiscountPercent,
          bundleBasePriceOverrides,
        },
      ),
    [
      bodyTemplate,
      bundleBasePriceOverrides,
      bundleDiscountPercent,
      bundleOfferEnabled,
      excludedProductNames,
      groupChannels,
      channelGroupLabels,
      inviteLinkOverrides,
      overrideInviteLinks,
      priceRounding,
      productNameOverrides,
      orderedSourceChannels,
      resolvedChannelIds,
    ],
  );

  useEffect(() => {
    onDraftChange(
      { payload, savedTemplateId },
      {
        title: payload.title || "Untitled template",
        icon: iconPresentation,
        badge: "Local draft",
      },
    );
  }, [iconPresentation, onDraftChange, payload, savedTemplateId]);

  const save = useMutation({
    mutationFn: () =>
      savedTemplateId
        ? telegramChannelMessageTemplatesApi.update(savedTemplateId, payload)
        : telegramChannelMessageTemplatesApi.create(payload),
    onSuccess: async () => {
      onClearDraft();
      await queryClient.invalidateQueries({
        queryKey: telegramMessageTemplateKeys.all,
      });
      pushToast("Message template saved", "success");
      onSaved();
    },
  });
  const send = useMutation({
    mutationFn: () =>
      telegramSystemBotApi.sendPostPreview({
        title: title.trim() || "Channel list",
        text: renderedText,
        imageUrls: [],
        buttonRows: [],
      }),
    onMutate: () => setSendError(""),
    onSuccess: () => pushToast("Preview sent to System Bot", "success"),
    onError: () =>
      setSendError(
        "Could not send the preview. Check the System Bot connection.",
      ),
  });
  const canUse = stableSourceIds.length > 0 && bodyTemplate.trim().length > 0;

  return (
    <div className="space-y-4">
      <TelegramChannelMessageTemplateEditorHeader
        onBack={onBack}
        draftAutosaveEnabled={!savedTemplateId}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
        <Card className="space-y-4">
          <TelegramChannelMessageTemplateEditorTabs
            value={activeSection}
            onChange={setActiveSection}
          />
          <TelegramChannelMessageTemplateSettings
            section={activeSection}
            channels={channels}
            networks={networks}
            title={title}
            iconId={iconId}
            iconPresentation={iconPresentation}
            mode={mode}
            networkId={networkId}
            channelIds={channelIds}
            groupChannels={groupChannels}
            channelGroupLabels={channelGroupLabels}
            layout={layout}
            overrideInviteLinks={overrideInviteLinks}
            inviteLinkOverrides={inviteLinkOverrides}
            sourceChannels={orderedSourceChannels}
            availableProductNames={availableProductNames}
            excludedProductNames={excludedProductNames}
            priceRounding={priceRounding}
            priceMode={priceMode}
            productNameOverrides={productNameOverrides}
            bundleOfferEnabled={bundleOfferEnabled}
            bundleDiscountPercent={bundleDiscountPercent}
            bundleBasePriceOverrides={bundleBasePriceOverrides}
            onTitleChange={setTitle}
            onIconChange={(value, presentation) => {
              setIconId(value);
              setIconPresentation(presentation);
            }}
            onModeChange={setMode}
            onNetworkChange={setNetworkId}
            onChannelsChange={setChannelIds}
            onOrderChange={setChannelOrderIds}
            onGroupChannelsChange={setGroupChannels}
            onChannelGroupLabelsChange={setChannelGroupLabels}
            onLayoutChange={setLayout}
            onOverrideInviteLinksChange={setOverrideInviteLinks}
            onInviteLinkOverridesChange={setInviteLinkOverrides}
            onExcludedProductNamesChange={setExcludedProductNames}
            onPriceRoundingChange={setPriceRounding}
            onPriceModeChange={setPriceMode}
            onProductNameOverridesChange={setProductNameOverrides}
            onBundleOfferEnabledChange={setBundleOfferEnabled}
            onBundleDiscountPercentChange={setBundleDiscountPercent}
            onBundleBasePriceOverridesChange={setBundleBasePriceOverrides}
          />
          {sourceQuery.data?.channels.some(
            (channel) => !channel.inviteLinks.length,
          ) ? (
            <p className="text-sm text-amber-300">
              Some channels have no invite link. Add one in the channel menu
              before sending.
            </p>
          ) : null}
          {sendError ? (
            <p className="text-sm text-rose-300">{sendError}</p>
          ) : null}
          {save.isError ? (
            <p className="text-sm text-rose-300">
              Could not save this template. Check the selected channels and
              invite links.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={!canUse || sourceQuery.isFetching || send.isPending}
              onClick={() => send.mutate()}
            >
              <Bot size={16} />
              {send.isPending ? "Sending…" : "Send to System Bot"}
            </Button>
            <Button
              type="button"
              disabled={!canUse || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save size={16} />
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        </Card>
        <div className="xl:sticky xl:top-4">
          {sourceQuery.isFetching ? (
            <TelegramChannelMessageTemplatePreviewSkeleton />
          ) : sourceQuery.isError ? (
            <ErrorState text="Could not load current channel data for the preview." />
          ) : stableSourceIds.length ? (
            <TelegramPostPreview
              channelTitle={title.trim() || "Generated channel list"}
              text={renderedText}
              imageUrls={[]}
            />
          ) : (
            <Card className="text-sm text-neutral-400">
              Select channels or a network to build the Telegram preview.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
