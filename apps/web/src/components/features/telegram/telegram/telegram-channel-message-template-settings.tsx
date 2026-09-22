import type {
  TelegramChannelMessageTemplatePayload,
  TelegramMessageTemplatePriceRounding,
  TelegramMessageTemplateGroupMode,
} from "@telegram-system/shared";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { FormField } from "@/components/ui/primitives";
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

type Layout = ReturnType<typeof readTelegramChannelMessageTemplateLayout>;
type SourceChannels = Awaited<
  ReturnType<typeof telegramChannelMessageTemplatesApi.source>
>["channels"];

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
