import type { ResolvedEmoji } from "./resolved-emoji";

export type TelegramMessageTemplateScopeMode = "CHANNELS" | "NETWORK";
export type TelegramMessageTemplateGroupMode = "CUSTOM" | "NETWORK";
export type TelegramMessageTemplatePriceRounding =
  | "NONE"
  | "NEAREST_5"
  | "NEAREST_10";

export type TelegramChannelMessageTemplatePayload = {
  title?: string | null;
  iconId?: string | null;
  scopeMode: TelegramMessageTemplateScopeMode;
  networkId?: string | null;
  channelIds: string[];
  groupChannels?: boolean;
  groupMode?: TelegramMessageTemplateGroupMode;
  channelGroupLabels?: Record<string, string>;
  channelGroupHeaderTemplate?: string | null;
  introText?: string | null;
  audienceSummaryTemplate?: string | null;
  outroText?: string | null;
  bodyTemplate: string;
  overrideInviteLinks: boolean;
  inviteLinkOverrides: Record<string, string>;
  excludedProductNames?: string[];
  priceRounding?: TelegramMessageTemplatePriceRounding;
  productNameOverrides?: Record<string, string>;
  bundleOfferEnabled?: boolean;
  bundleDiscountPercent?: number;
  bundleBasePriceOverrides?: Record<string, string>;
  bundleOfferTemplate?: string | null;
};

export type TelegramChannelMessageTemplate =
  TelegramChannelMessageTemplatePayload & {
    id: string;
    iconPresentation?: ResolvedEmoji | null;
    createdAt: string;
    updatedAt: string;
  };

export type TelegramMessageTemplateSourcePayload =
  | { channelIds: string[]; templateId?: never }
  | { templateId: string; channelIds?: never };

export type TelegramMessageTemplateInviteLink = {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
};

export type TelegramMessageTemplateProduct = {
  id: string;
  name: string;
  price: string | null;
  internalPrice: string | null;
  expectedViews: number | null;
  publicCpm: string | null;
  internalCpm: string | null;
  currency: string;
};

export type TelegramMessageTemplateNetworkSource = {
  name: string;
  emojiSource: string | null;
};

export type TelegramMessageTemplateChannelSource = {
  id: string;
  title: string;
  description: string | null;
  username: string | null;
  photoUrl: string | null;
  tgStatUrl: string | null;
  emojiSource: string;
  subscribersCount: number | null;
  networkGroups: TelegramMessageTemplateNetworkSource[];
  viewsPerPost?: number | null;
  iconPresentation: ResolvedEmoji | null;
  defaultInviteLinkId: string | null;
  inviteLinks: TelegramMessageTemplateInviteLink[];
  products: TelegramMessageTemplateProduct[];
};

export type TelegramMessageTemplateSourceResponse = {
  channels: TelegramMessageTemplateChannelSource[];
};
