import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TelegramChannelMessageTemplatePayload,
  TelegramMessageTemplatePriceRounding,
  TelegramMessageTemplateViewsRounding,
  TelegramMessageTemplateGroupMode,
} from "@telegram-system/shared";
import {
  telegramChannelsApi,
  type TelegramChannel,
  type TelegramChannelNetwork,
} from "@/lib/api";
import { workspaceKeys } from "@/lib/query-keys";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
} from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import { TelegramMessageTemplateInviteLinkSelect } from "./telegram-message-template-invite-link-select";
import type { telegramChannelMessageTemplatesApi } from "@/lib/features/telegram/telegram-channel-message-templates-api";
import { TelegramChannelScopeSelector } from "./telegram-channel-scope-selector";
import type { readTelegramChannelMessageTemplateLayout } from "./telegram-channel-message-template-format";
import type { TelegramChannelMessageTemplatePriceMode } from "./telegram-channel-message-template-format";
import type { TelegramChannelMessageTemplateEditorSection } from "./telegram-channel-message-template-editor-tabs";
import { TelegramChannelMessageTemplateLayoutOptions } from "./telegram-channel-message-template-layout-options";
import { TelegramChannelMessageTemplatePriceOptions } from "./telegram-channel-message-template-price-options";
import { TelegramChannelMessageTemplateOrder } from "./telegram-channel-message-template-order";
import { TelegramTextEditor } from "./telegram-text-editor";
import { TelegramCustomEmojiPickerModal } from "./telegram-custom-emoji-picker-modal";
import { customEmojiToken } from "./telegram-custom-emoji";

type Layout = ReturnType<typeof readTelegramChannelMessageTemplateLayout>;
type SourceChannels = Awaited<
  ReturnType<typeof telegramChannelMessageTemplatesApi.source>
>["channels"];

const displayEmoji = (value: string) =>
  value.match(/^!\[([^\]\n]*)\]\(tg:\/\/emoji\?id=\d+\)$/)?.[1] || value;

export function TelegramChannelMessageTemplateSettings({
  section,
  channels,
  networks,
  mode,
  networkId,
  channelIds,
  groupChannels,
  groupMode,
  channelGroupLabels,
  channelGroupHeaderTemplate,
  introText,
  audienceSummaryTemplate,
  outroText,
  layout,
  overrideInviteLinks,
  inviteLinkOverrides,
  sourceChannels,
  availableProductNames,
  viewProductNames,
  showTotalViews,
  viewsEmoji,
  totalViewsLabel,
  viewsRounding,
  excludedProductNames,
  priceRounding,
  priceMode,
  productNameOverrides,
  bundleOfferEnabled,
  bundleDiscountPercent,
  bundleBasePriceOverrides,
  bundleOfferTemplate,
  onModeChange,
  onNetworkChange,
  onChannelsChange,
  onOrderChange,
  onGroupChannelsChange,
  onGroupModeChange,
  onChannelGroupLabelsChange,
  onChannelGroupHeaderTemplateChange,
  onIntroTextChange,
  onAudienceSummaryTemplateChange,
  onOutroTextChange,
  onLayoutChange,
  onOverrideInviteLinksChange,
  onInviteLinkOverridesChange,
  onExcludedProductNamesChange,
  onViewProductNamesChange,
  onShowTotalViewsChange,
  onViewsEmojiChange,
  onTotalViewsLabelChange,
  onViewsRoundingChange,
  onPriceRoundingChange,
  onPriceModeChange,
  onProductNameOverridesChange,
  onBundleOfferEnabledChange,
  onBundleDiscountPercentChange,
  onBundleBasePriceOverridesChange,
  onBundleOfferTemplateChange,
}: {
  section: TelegramChannelMessageTemplateEditorSection;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  mode: "network" | "channels";
  networkId: string;
  channelIds: string[];
  groupChannels: boolean;
  groupMode: TelegramMessageTemplateGroupMode;
  channelGroupLabels: Record<string, string>;
  channelGroupHeaderTemplate: string;
  introText: string;
  audienceSummaryTemplate: string;
  outroText: string;
  layout: Layout;
  overrideInviteLinks: boolean;
  inviteLinkOverrides: TelegramChannelMessageTemplatePayload["inviteLinkOverrides"];
  sourceChannels?: SourceChannels;
  availableProductNames: string[];
  viewProductNames: string[];
  showTotalViews: boolean;
  viewsEmoji: string;
  totalViewsLabel: string;
  viewsRounding: TelegramMessageTemplateViewsRounding;
  excludedProductNames: string[];
  priceRounding: TelegramMessageTemplatePriceRounding;
  priceMode: TelegramChannelMessageTemplatePriceMode;
  productNameOverrides: NonNullable<
    TelegramChannelMessageTemplatePayload["productNameOverrides"]
  >;
  bundleOfferEnabled: boolean;
  bundleDiscountPercent: number;
  bundleBasePriceOverrides: NonNullable<
    TelegramChannelMessageTemplatePayload["bundleBasePriceOverrides"]
  >;
  bundleOfferTemplate: string;
  onModeChange: (value: "network" | "channels") => void;
  onNetworkChange: (value: string) => void;
  onChannelsChange: (value: string[]) => void;
  onOrderChange: (value: string[]) => void;
  onGroupChannelsChange: (value: boolean) => void;
  onGroupModeChange: (value: TelegramMessageTemplateGroupMode) => void;
  onChannelGroupLabelsChange: (value: Record<string, string>) => void;
  onChannelGroupHeaderTemplateChange: (value: string) => void;
  onIntroTextChange: (value: string) => void;
  onAudienceSummaryTemplateChange: (value: string) => void;
  onOutroTextChange: (value: string) => void;
  onLayoutChange: (value: Layout) => void;
  onOverrideInviteLinksChange: (value: boolean) => void;
  onInviteLinkOverridesChange: (
    value: TelegramChannelMessageTemplatePayload["inviteLinkOverrides"],
  ) => void;
  onExcludedProductNamesChange: (value: string[]) => void;
  onViewProductNamesChange: (value: string[]) => void;
  onShowTotalViewsChange: (value: boolean) => void;
  onViewsEmojiChange: (value: string) => void;
  onTotalViewsLabelChange: (value: string) => void;
  onViewsRoundingChange: (value: TelegramMessageTemplateViewsRounding) => void;
  onPriceRoundingChange: (value: TelegramMessageTemplatePriceRounding) => void;
  onPriceModeChange: (value: TelegramChannelMessageTemplatePriceMode) => void;
  onProductNameOverridesChange: (
    value: NonNullable<
      TelegramChannelMessageTemplatePayload["productNameOverrides"]
    >,
  ) => void;
  onBundleOfferEnabledChange: (value: boolean) => void;
  onBundleDiscountPercentChange: (value: number) => void;
  onBundleBasePriceOverridesChange: (
    value: NonNullable<
      TelegramChannelMessageTemplatePayload["bundleBasePriceOverrides"]
    >,
  ) => void;
  onBundleOfferTemplateChange: (value: string) => void;
}) {
  const [premiumEmojiPickerOpen, setPremiumEmojiPickerOpen] = useState(false);
  const [premiumEmojiRequested, setPremiumEmojiRequested] = useState(false);
  const premiumEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    enabled: premiumEmojiPickerOpen && premiumEmojiRequested,
    staleTime: 5 * 60_000,
  });
  const updateProductNameOverride = (name: string, nextValue: string) => {
    const next = { ...productNameOverrides };
    if (nextValue) next[name] = nextValue;
    else delete next[name];
    onProductNameOverridesChange(next);
  };

  if (section === "text") {
    return (
      <div className="space-y-4">
        <FormField label="Text before the message">
          <TelegramTextEditor
            value={introText}
            onChange={onIntroTextChange}
            placeholder="Optional opening text for the whole message. Use {{total_subscribers}} for the rounded channel total."
            rows={7}
            enableCustomEmoji
          />
          <p className="mt-1.5 text-xs text-neutral-400">
            {"{{total_subscribers}}"} is the total number of readers across all
            selected channels, rounded down to hundreds. This text touches the
            channel list by default; add line breaks here when you want space
            before the first channel.
          </p>
        </FormField>
        <FormField label="Text after the message">
          <TelegramTextEditor
            value={outroText}
            onChange={onOutroTextChange}
            placeholder="Optional closing text for the whole message"
            rows={7}
            enableCustomEmoji
          />
          <p className="mt-1.5 text-xs text-neutral-400">
            Add line breaks here when you want space after the list or package
            offer.
          </p>
        </FormField>
      </div>
    );
  }
  if (section === "details") {
    return (
      <div className="space-y-4">
        <TelegramChannelScopeSelector
          mode={mode}
          selectedNetworkId={networkId}
          selectedChannelIds={channelIds}
          networks={networks}
          channels={channels}
          onModeChange={onModeChange}
          onNetworkChange={onNetworkChange}
          onChannelsChange={onChannelsChange}
          label="Generate for"
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-500"
            checked={layout.separateChannels}
            onChange={(event) =>
              onLayoutChange({
                ...layout,
                separateChannels: event.target.checked,
              })
            }
          />
          <span>
            <span className="block text-sm font-medium text-white">
              Leave a blank line between channels
            </span>
            <span className="block text-xs text-neutral-400">
              Turn this off to render channel entries without an extra gap.
            </span>
          </span>
        </label>
        {sourceChannels?.length ? (
          <TelegramChannelMessageTemplateOrder
            channels={sourceChannels}
            groupChannels={groupChannels}
            groupMode={groupMode}
            groupLabels={channelGroupLabels}
            groupHeaderTemplate={channelGroupHeaderTemplate}
            onOrderChange={onOrderChange}
            onGroupChannelsChange={onGroupChannelsChange}
            onGroupModeChange={onGroupModeChange}
            onGroupLabelsChange={onChannelGroupLabelsChange}
            onGroupHeaderTemplateChange={onChannelGroupHeaderTemplateChange}
          />
        ) : null}
      </div>
    );
  }

  if (section === "channel") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white">
            Information to include
          </h3>
          <p className="mb-3 mt-0.5 text-xs text-neutral-400">
            Build every channel heading with switches instead of template code.
          </p>
          <TelegramChannelMessageTemplateLayoutOptions
            value={layout}
            onChange={onLayoutChange}
          />
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-500"
              checked={overrideInviteLinks}
              onChange={(event) =>
                onOverrideInviteLinksChange(event.target.checked)
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
          {overrideInviteLinks && sourceChannels?.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {sourceChannels.map((channel) => (
                <FormField key={channel.id} label={channel.title}>
                  <TelegramMessageTemplateInviteLinkSelect
                    channelId={channel.id}
                    links={channel.inviteLinks}
                    value={
                      inviteLinkOverrides[channel.id] ||
                      channel.defaultInviteLinkId ||
                      ""
                    }
                    onChange={(linkId) =>
                      onInviteLinkOverridesChange({
                        ...inviteLinkOverrides,
                        [channel.id]: linkId,
                      })
                    }
                  />
                </FormField>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (section === "views") {
    return (
      <>
        <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <input
              type="checkbox"
              aria-label="Show total views"
              className="mt-0.5 h-4 w-4 accent-blue-500"
              checked={showTotalViews}
              onChange={(event) => onShowTotalViewsChange(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-white">
                Total views
              </span>
              <span className="block text-xs text-neutral-400">
                Show estimated totals for each selected format below the channel
                list.
              </span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Views emoji">
              <div className="flex flex-wrap items-center gap-2">
                <IconPicker
                  compact
                  allowImages={false}
                  icon={{
                    type: "unicode",
                    value: displayEmoji(viewsEmoji || "👁"),
                  }}
                  onChange={(_iconId, presentation) => {
                    if (presentation?.type === "unicode") {
                      onViewsEmojiChange(presentation.value);
                    }
                  }}
                  onEmojiChange={(emoji) => onViewsEmojiChange(emoji || "👁")}
                  buttonLabel="Choose views emoji"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9"
                  onClick={() => setPremiumEmojiPickerOpen(true)}
                >
                  Premium emoji
                </Button>
              </div>
            </FormField>
            <FormField label="Round views">
              <CustomSelect
                value={viewsRounding}
                onChange={(value) =>
                  onViewsRoundingChange(
                    value as TelegramMessageTemplateViewsRounding,
                  )
                }
                options={[
                  { value: "NONE", label: "Exact views" },
                  { value: "NEAREST_10", label: "Round to nearest 10" },
                  { value: "NEAREST_100", label: "Round to nearest 100" },
                  { value: "NEAREST_1000", label: "Round to nearest 1,000" },
                ]}
              />
            </FormField>
          </div>
          <FormField label="Total views label">
            <Input
              value={totalViewsLabel}
              maxLength={80}
              onChange={(event) => onTotalViewsLabelChange(event.target.value)}
              placeholder="Total views"
            />
          </FormField>
          <fieldset>
            <legend className="text-sm font-medium text-white">
              Formats with views
            </legend>
            <p className="mt-0.5 text-xs text-neutral-400">
              Select formats to show their estimated views independently from
              prices.
            </p>
            <div className="mt-3 space-y-2">
              {availableProductNames.map((name) => {
                const checked = viewProductNames.includes(name);
                return (
                  <div
                    key={name}
                    className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-2 sm:grid-cols-[auto_minmax(160px,1fr)]"
                  >
                    <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-neutral-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-500"
                        checked={checked}
                        onChange={(event) =>
                          onViewProductNamesChange(
                            event.target.checked
                              ? [...viewProductNames, name]
                              : viewProductNames.filter(
                                  (item) => item !== name,
                                ),
                          )
                        }
                      />
                      {name}
                    </label>
                    <Input
                      aria-label={`Display name for ${name} views`}
                      value={productNameOverrides[name] || ""}
                      placeholder={`Display as “${name}”`}
                      onChange={(event) =>
                        updateProductNameOverride(name, event.target.value)
                      }
                    />
                  </div>
                );
              })}
              {!availableProductNames.length ? (
                <span className="text-xs text-neutral-500">
                  Select channels to load their formats.
                </span>
              ) : null}
            </div>
          </fieldset>
        </div>
        <TelegramCustomEmojiPickerModal
          open={premiumEmojiPickerOpen}
          onClose={() => setPremiumEmojiPickerOpen(false)}
          packs={premiumEmojiPacks.data?.packs || []}
          onSelect={(emoji) => {
            onViewsEmojiChange(customEmojiToken(emoji));
            setPremiumEmojiPickerOpen(false);
          }}
          onSelectStandard={(emoji) => {
            onViewsEmojiChange(emoji);
            setPremiumEmojiPickerOpen(false);
          }}
          onPremiumTabOpen={() => setPremiumEmojiRequested(true)}
          premiumLoading={premiumEmojiPacks.isLoading}
          premiumError={premiumEmojiPacks.isError}
          onRetryPremium={() => void premiumEmojiPacks.refetch()}
        />
      </>
    );
  }
  if (section !== "prices") return null;
  return (
    <TelegramChannelMessageTemplatePriceOptions
      productNames={availableProductNames}
      excludedProductNames={excludedProductNames}
      priceRounding={priceRounding}
      priceMode={priceMode}
      productNameOverrides={productNameOverrides}
      bundleOfferEnabled={bundleOfferEnabled}
      bundleDiscountPercent={bundleDiscountPercent}
      bundleBasePriceOverrides={bundleBasePriceOverrides}
      bundleOfferTemplate={bundleOfferTemplate}
      onExcludedProductNamesChange={onExcludedProductNamesChange}
      onPriceRoundingChange={onPriceRoundingChange}
      onPriceModeChange={onPriceModeChange}
      onProductNameOverridesChange={onProductNameOverridesChange}
      onBundleOfferEnabledChange={onBundleOfferEnabledChange}
      onBundleDiscountPercentChange={onBundleDiscountPercentChange}
      onBundleBasePriceOverridesChange={onBundleBasePriceOverridesChange}
      onBundleOfferTemplateChange={onBundleOfferTemplateChange}
    />
  );
}
