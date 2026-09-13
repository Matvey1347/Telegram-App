import type { ResolvedEmoji } from "./resolved-emoji";

export type TelegramMessageTemplateScopeMode = "CHANNELS" | "NETWORK";

export type TelegramChannelMessageTemplatePayload = {
  title?: string | null;
  iconId?: string | null;
  scopeMode: TelegramMessageTemplateScopeMode;
  networkId?: string | null;
  channelIds: string[];
  bodyTemplate: string;
  overrideInviteLinks: boolean;
  inviteLinkOverrides: Record<string, string>;
};

export type TelegramChannelMessageTemplate =
  TelegramChannelMessageTemplatePayload & {
    id: string;
    iconPresentation?: ResolvedEmoji | null;
    createdAt: string;
    updatedAt: string;
  };

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
  currency: string;
};

export type TelegramMessageTemplateChannelSource = {
  id: string;
  title: string;
  username: string | null;
  photoUrl: string | null;
  tgStatUrl: string | null;
  emojiSource: string;
  iconPresentation: ResolvedEmoji | null;
  defaultInviteLinkId: string | null;
  inviteLinks: TelegramMessageTemplateInviteLink[];
  products: TelegramMessageTemplateProduct[];
};

export type TelegramMessageTemplateSourceResponse = {
  channels: TelegramMessageTemplateChannelSource[];
};
