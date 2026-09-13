import type {
  CrossPromotionPlacementPost,
  CrossPromotionTargetInput,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
} from "@/lib/features/growth/telegram-ad-sales";
import type { TelegramChannelScopeMode } from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import type { CrossPromotionPlacementSettingsValue } from "./cross-promotion-placement-settings";

export const emptyCrossPromotionPost = (): TelegramSystemBotPostDraft => ({
  title: "",
  text: "",
  imageUrls: [],
  buttonRows: [],
});

type StoredPlacement = NonNullable<
  CrossPromotionPlacementPost["publisherPlacements"]
>[number];

export function placementSettingsFromStored(
  placements: StoredPlacement[],
  timezone: string,
): CrossPromotionPlacementSettingsValue {
  return {
    formatIds: Object.fromEntries(
      placements.map((placement) => [
        placement.telegramChannelId,
        placement.telegramAdProductId ?? "",
      ]),
    ),
    dates: Object.fromEntries(
      placements.map((placement) => [
        placement.telegramChannelId,
        channelLocalDateKey(new Date(placement.scheduledAt), timezone),
      ]),
    ),
    times: Object.fromEntries(
      placements.map((placement) => [
        placement.telegramChannelId,
        channelLocalTime(new Date(placement.scheduledAt), timezone),
      ]),
    ),
  };
}

export type CrossPromotionModalDraft = {
  iconId: string | null;
  title: string;
  publisherMode: TelegramChannelScopeMode;
  publisherNetworkId: string;
  publisherIds: string[];
  partnerIds: string[];
  partnerAdvertiserId?: string | null;
  partnerContact?: string;
  partnerTelegram?: string;
  targets: CrossPromotionTargetInput[];
  post: TelegramSystemBotPostDraft;
  date: string;
  partnerDate?: string;
  time: string;
  publisherSettings: CrossPromotionPlacementSettingsValue;
  partnerSettings: CrossPromotionPlacementSettingsValue;
  outboundMode: "PROMO" | "CUSTOM";
  outboundPost: TelegramSystemBotPostDraft;
  importedChannels: TelegramChannel[];
};
