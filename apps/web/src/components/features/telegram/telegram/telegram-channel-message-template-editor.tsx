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
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  Card,
  CustomSelect,
  ErrorState,
  FormField,
  Input,
  LoadingState,
} from "@/components/ui/primitives";
import { TelegramPostPreview } from "./telegram-post-preview";
import { TelegramChannelScopeSelector } from "./telegram-channel-scope-selector";
import { TelegramChannelMessageTemplatePriceOptions } from "./telegram-channel-message-template-price-options";
import {
  buildTelegramChannelMessageTemplate,
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
  readTelegramChannelMessageTemplateLayout,
  renderTelegramChannelMessageTemplate,
} from "./telegram-channel-message-template-format";
import { TelegramChannelMessageTemplateLayoutOptions } from "./telegram-channel-message-template-layout-options";
import {
  TelegramChannelMessageTemplateEditorHeader,
  TelegramChannelMessageTemplateEditorTabs,
  type TelegramChannelMessageTemplateEditorSection,
} from "./telegram-channel-message-template-editor-tabs";
import {
  type TelegramChannelMessageTemplateDraft,
  removeTelegramChannelMessageTemplateDraft,
  writeTelegramChannelMessageTemplateDraft,
} from "./telegram-channel-message-template-draft";
import {
  telegramChannelMessageTemplatesApi,
  telegramMessageTemplateKeys,
} from "@/lib/features/telegram/telegram-channel-message-templates-api";
import { useAppToast } from "@/providers/toast-provider";
import { telegramInviteLinkDefaultBadgeClassName } from "@/lib/features/telegram/telegram-invite-link-options";

const emptyPayload = (): TelegramChannelMessageTemplatePayload => ({
  title: "",
  iconId: null,
  scopeMode: "CHANNELS",
  networkId: null,
  channelIds: [],
  bodyTemplate: DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
  overrideInviteLinks: false,
  inviteLinkOverrides: {},
  excludedProductNames: [],
  priceRounding: "NONE",
  productNameOverrides: {},
  bundleOfferEnabled: false,
  bundleDiscountPercent: 10,
  bundleBasePriceOverrides: {},
});

export function TelegramChannelMessageTemplateEditor({
  channels,
  networks,
  initial,
  draftId,
  onBack,
  onSaved,
}: {
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  initial?:
    | TelegramChannelMessageTemplate
    | TelegramChannelMessageTemplateDraft;
  draftId: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const sourceForm = initial
    ? "form" in initial
      ? initial.form
      : initial
    : emptyPayload();
  const savedTemplateId = initial
    ? "form" in initial
      ? initial.savedTemplateId
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
  const [channelIds, setChannelIds] = useState(sourceForm.channelIds);
  const [activeSection, setActiveSection] =
    useState<TelegramChannelMessageTemplateEditorSection>("details");
  const [layout, setLayout] = useState(() =>
    readTelegramChannelMessageTemplateLayout(sourceForm.bodyTemplate),
  );
  const bodyTemplate = useMemo(
    () => buildTelegramChannelMessageTemplate(layout),
    [layout],
  );
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
    if (mode === "channels") return channelIds;
    if (!selectedNetwork) return channelIds;
    const valid = new Set(channels.map((channel) => channel.id));
    return (selectedNetwork?.channels || [])
      .map((channel) => channel.id)
      .filter((id) => valid.has(id));
  }, [channelIds, channels, mode, selectedNetwork]);

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
      channelIds: stableSourceIds,
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
      iconId,
      inviteLinkOverrides,
      mode,
      networkId,
      overrideInviteLinks,
      priceRounding,
      productNameOverrides,
      selectedNetwork?.isSystem,
      stableSourceIds,
      title,
    ],
  );
  const sourceQuery = useQuery({
    queryKey: telegramMessageTemplateKeys.source(stableSourceIds),
    queryFn: () => telegramChannelMessageTemplatesApi.source(stableSourceIds),
    enabled: stableSourceIds.length > 0,
    staleTime: 30_000,
  });
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
        sourceQuery.data?.channels || [],
        {
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
      inviteLinkOverrides,
      overrideInviteLinks,
      priceRounding,
      productNameOverrides,
      sourceQuery.data?.channels,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeTelegramChannelMessageTemplateDraft(window.localStorage, {
        version: 1,
        id: draftId,
        savedTemplateId,
        form: payload,
        preview: { icon: iconPresentation },
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftId, iconPresentation, payload, savedTemplateId]);

  const save = useMutation({
    mutationFn: () =>
      savedTemplateId
        ? telegramChannelMessageTemplatesApi.update(savedTemplateId, payload)
        : telegramChannelMessageTemplatesApi.create(payload),
    onSuccess: async () => {
      removeTelegramChannelMessageTemplateDraft(localStorage, draftId);
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
      <TelegramChannelMessageTemplateEditorHeader onBack={onBack} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
        <Card className="space-y-4">
          <TelegramChannelMessageTemplateEditorTabs
            value={activeSection}
            onChange={setActiveSection}
          />
          {activeSection === "details" ? (
            <div className="space-y-4">
              <div className="grid items-end gap-3 sm:grid-cols-[72px_minmax(0,1fr)]">
                <FormField label="Emoji">
                  <IconPicker
                    compact
                    iconId={iconId || null}
                    icon={iconPresentation}
                    onChange={(value, presentation) => {
                      setIconId(value || "");
                      setIconPresentation(presentation ?? null);
                    }}
                    allowImages={false}
                    buttonLabel="Choose emoji"
                  />
                </FormField>
                <FormField label="Name (optional)">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="All channels price list"
                  />
                </FormField>
              </div>
              <TelegramChannelScopeSelector
                mode={mode}
                selectedNetworkId={networkId}
                selectedChannelIds={channelIds}
                networks={networks}
                channels={channels}
                onModeChange={setMode}
                onNetworkChange={setNetworkId}
                onChannelsChange={setChannelIds}
                label="Generate for"
              />
            </div>
          ) : null}
          {activeSection === "channel" ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-white">
                  Information to include
                </h3>
                <p className="mb-3 mt-0.5 text-xs text-neutral-400">
                  Build every channel heading with switches instead of template
                  code.
                </p>
                <TelegramChannelMessageTemplateLayoutOptions
                  value={layout}
                  onChange={setLayout}
                />
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-500"
                    checked={overrideInviteLinks}
                    onChange={(event) =>
                      setOverrideInviteLinks(event.target.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-white">
                      Choose a different invite link per channel
                    </span>
                    <span className="block text-xs text-neutral-400">
                      Off uses the main link configured in Appearance.
                    </span>
                  </span>
                </label>
                {overrideInviteLinks && sourceQuery.data?.channels.length ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {sourceQuery.data.channels.map((channel) => (
                      <FormField key={channel.id} label={channel.title}>
                        <CustomSelect
                          value={
                            inviteLinkOverrides[channel.id] ||
                            channel.defaultInviteLinkId ||
                            ""
                          }
                          onChange={(linkId) =>
                            setInviteLinkOverrides((current) => ({
                              ...current,
                              [channel.id]: linkId,
                            }))
                          }
                          placeholder="Select invite link"
                          options={channel.inviteLinks.map((link) => ({
                            value: link.id,
                            label: link.name,
                            badgeClassName:
                              telegramInviteLinkDefaultBadgeClassName({
                                isDefaultForChannel: link.isDefault,
                              }),
                            meta: link.url,
                          }))}
                        />
                      </FormField>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {activeSection === "prices" ? (
            <TelegramChannelMessageTemplatePriceOptions
              productNames={availableProductNames}
              excludedProductNames={excludedProductNames}
              priceRounding={priceRounding}
              productNameOverrides={productNameOverrides}
              bundleOfferEnabled={bundleOfferEnabled}
              bundleDiscountPercent={bundleDiscountPercent}
              bundleBasePriceOverrides={bundleBasePriceOverrides}
              onExcludedProductNamesChange={setExcludedProductNames}
              onPriceRoundingChange={setPriceRounding}
              onProductNameOverridesChange={setProductNameOverrides}
              onBundleOfferEnabledChange={setBundleOfferEnabled}
              onBundleDiscountPercentChange={setBundleDiscountPercent}
              onBundleBasePriceOverridesChange={setBundleBasePriceOverrides}
            />
          ) : null}
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
            <Card>
              <LoadingState text="Loading channel data and prices…" />
            </Card>
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
