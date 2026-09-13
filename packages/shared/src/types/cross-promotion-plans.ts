import type { TelegramSystemBotPostDraft } from "./telegram-system-bot";
import type { ResolvedEmoji } from "./resolved-emoji";

export type CrossPromotionPlanKind = "DIRECT_MUTUAL" | "OWN_CHANNELS";
export type CrossPromotionPlanStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type CrossPromotionTargetInput = {
  telegramChannelId: string;
  promoId?: string | null;
  inviteLinkId: string;
};

export type CrossPromotionChannelPlacementInput = {
  telegramChannelId: string;
  telegramAdProductId?: string | null;
  scheduledAt: string;
  expectedViews?: number | null;
};

export type CrossPromotionPlacementPost = TelegramSystemBotPostDraft & {
  iconId?: string | null;
  partnerPublicationPost?: TelegramSystemBotPostDraft | null;
  partnerPostSource?: "PROMO" | "CUSTOM";
  publisherPlacements?: CrossPromotionChannelPlacementInput[];
  partnerPlacements?: CrossPromotionChannelPlacementInput[];
};

export type CreateCrossPromotionPlanPayload = {
  kind: CrossPromotionPlanKind;
  advertiserId?: string | null;
  title: string;
  publisherChannelIds: string[];
  partnerChannelIds: string[];
  targets: CrossPromotionTargetInput[];
  publicationPost: CrossPromotionPlacementPost;
  scheduledAt: string;
  trackingEndsAt?: string | null;
};

export type CrossPromotionSchedulingProgress = {
  phase: "VALIDATING" | "SCHEDULING" | "SAVING" | "ROLLING_BACK";
  message: string;
  telegramChannelId?: string;
  success?: boolean;
};

export type CrossPromotionPlan = CreateCrossPromotionPlanPayload & {
  id: string;
  iconPresentation: ResolvedEmoji | null;
  advertiser?: {
    id: string;
    displayName: string;
    telegramUsername: string | null;
    photoUrl: string | null;
  } | null;
  status: CrossPromotionPlanStatus;
  lastError?: string | null;
  placementPostIds: Array<{
    telegramChannelId: string;
    managedPostId: string;
    postGroupId?: string | null;
  }>;
  baselineTargetCounters: Array<{
    inviteLinkId: string;
    joinedCount: number;
    requestedCount: number;
  }>;
  baselinePublisherSubscribers: Array<{
    telegramChannelId: string;
    subscribersCount: number | null;
  }>;
  targetResults: Array<{
    telegramChannelId: string;
    title: string;
    photoUrl: string | null;
    promoTitle: string;
    inviteLinkUrl: string;
    joinedCount: number;
    requestedCount: number;
  }>;
  publisherResults: Array<{
    telegramChannelId: string;
    title: string;
    photoUrl: string | null;
    subscribersLost: number | null;
    postViews: number | null;
    postReactions: number | null;
  }>;
  partnerResults: Array<{
    telegramChannelId: string;
    title: string;
    photoUrl: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};
