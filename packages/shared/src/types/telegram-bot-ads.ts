import type { ResolvedEmoji } from "./resolved-emoji";
import type { TelegramPostButtonRows } from "./telegram-post-buttons";
import type { TelegramPostMediaItem } from "./telegram-post-media";

export type BotAdsEnvironment = "LOCAL" | "PRODUCTION";

export type BotAdCreative = {
  text: string;
  plainText?: string | null;
  formattedHtml?: string | null;
  imageUrls?: string[];
  mediaItems?: TelegramPostMediaItem[];
  buttonRows?: TelegramPostButtonRows;
};

export type BotAdPromoView = BotAdCreative & {
  id: string;
  title: string;
  iconId: string | null;
  iconPresentation: ResolvedEmoji | null;
  archivedAt: string | null;
};

export const BOT_AD_PLACEMENT_LIMIT = 25;
export type BotAdLinkKind = "link" | "placement";
export type BotAdChannelOption = {
  id: string;
  title: string;
  avatarPresentation: ResolvedEmoji | null;
  isTest?: boolean;
};
export type CreateBotAdPlacements = {
  campaignId: string;
  title: string;
  promoId: string;
  iconId?: string;
  networkIds?: string[];
  plannedAt?: string;
  date?: string;
  targets: { id: string; channelId: string }[];
};

export type BotAdPlacementCampaign = {
  title: string;
  plannedAt: string | null;
  date: string | null;
  iconPresentation: ResolvedEmoji | null;
  networks: {
    id: string;
    name: string;
    iconPresentation: ResolvedEmoji | null;
  }[];
};

export type BotAdLinkView = {
  id: string;
  title: string;
  createdAt: string;
  url: string;
  campaignId: string | null;
  campaign?: BotAdPlacementCampaign;
  promo: { id: string; title: string } | null;
  channel: BotAdChannelOption | { id: string; title: string } | null;
  post: {
    id: string;
    status: string;
    requestedPublication: string | null;
    scheduledAt: string | null;
    publishedAt: string | null;
    url: string | null;
  } | null;
  views: number | null;
  reactions: number | null;
  clicks: number | null;
  starts: number;
  active: number;
  retained: number;
  paid: number;
};

export type BotAdCampaignTotals = Pick<
  BotAdLinkView,
  "views" | "reactions" | "clicks" | "starts" | "active" | "retained" | "paid"
> & { placements: number; published: number };

export type BotAdsLinksPage = BotAdsPage<BotAdLinkView> & {
  totals?: BotAdCampaignTotals;
};

export type BotAdsPage<T> = { items: T[]; hasMore: boolean };
