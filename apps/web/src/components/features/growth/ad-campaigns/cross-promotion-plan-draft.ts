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

export function normalizeCrossPromotionModalDraft(
  value: unknown,
): CrossPromotionModalDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<CrossPromotionModalDraft>;
  if (!Array.isArray(draft.publisherIds) || !draft.post) return null;
  return {
    ...(draft as CrossPromotionModalDraft),
    publisherMode: draft.publisherMode ?? "channels",
    publisherNetworkId: draft.publisherNetworkId ?? "",
    partnerIds: Array.isArray(draft.partnerIds) ? draft.partnerIds : [],
    targets: Array.isArray(draft.targets) ? draft.targets : [],
    partnerDate: draft.partnerDate ?? draft.date,
    publisherSettings: draft.publisherSettings ?? { formatIds: {}, times: {} },
    partnerSettings: draft.partnerSettings ?? { formatIds: {}, times: {} },
    outboundMode: draft.outboundMode ?? "PROMO",
    outboundPost: draft.outboundPost ?? emptyCrossPromotionPost(),
    importedChannels: Array.isArray(draft.importedChannels)
      ? draft.importedChannels
      : [],
  };
}

function hasPostContent(post: TelegramSystemBotPostDraft) {
  return Boolean(
    post.title?.trim() ||
      post.text.trim() ||
      post.imageUrls.length ||
      post.mediaItems?.length ||
      post.buttonRows?.some((row) => row.length),
  );
}

export function hasMeaningfulCrossPromotionDraft(
  draft: CrossPromotionModalDraft,
) {
  return Boolean(
    draft.title.trim() ||
      draft.iconId ||
      draft.publisherIds.length ||
      draft.publisherNetworkId ||
      draft.partnerIds.length ||
      draft.partnerAdvertiserId ||
      draft.partnerContact?.trim() ||
      draft.partnerTelegram?.trim() ||
      draft.targets.length ||
      hasPostContent(draft.post) ||
      hasPostContent(draft.outboundPost) ||
      Object.keys(draft.publisherSettings?.formatIds ?? {}).length ||
      Object.keys(draft.publisherSettings?.times ?? {}).length ||
      Object.keys(draft.partnerSettings?.formatIds ?? {}).length ||
      Object.keys(draft.partnerSettings?.times ?? {}).length
  );
}
