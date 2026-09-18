export type TelegramChannelTrafficSourceKind =
  | "MUTUAL_PROMOTION"
  | "FOLDERS"
  | "AD_CAMPAIGNS"
  | "AUDIENCE_TRANSFER"
  | "BOT"
  | "BROADCAST"
  | "OTHER";

export type TelegramChannelTrafficAttributionMetrics = {
  acquired: number;
  retained: number;
  unsubscribed: number;
  unsubscribePercent: number;
  spend: number | null;
  averageSubscriberCost: number | null;
  retainedSubscriberCost: number | null;
  currency: string;
};

export type TelegramChannelTrafficSourceSummary =
  TelegramChannelTrafficAttributionMetrics & {
    kind: TelegramChannelTrafficSourceKind;
    label: string;
    sourceCount: number;
    linkCount: number;
  };

export type TelegramChannelTrafficAttributionPreview =
  TelegramChannelTrafficAttributionMetrics & {
    sources: TelegramChannelTrafficSourceSummary[];
  };

export type TelegramChannelTrafficAttributionItem =
  TelegramChannelTrafficAttributionMetrics & {
    id: string;
    kind: TelegramChannelTrafficSourceKind;
    title: string;
    subtitle: string | null;
    avatarUrl: string | null;
    inviteLinkIds: string[];
    inviteLinks: Array<{
      id: string;
      name: string;
      url: string;
    }>;
    startsAt: string | null;
    endsAt: string | null;
  };

export type TelegramChannelTrafficAttributionPoint = {
  at: string;
  inviteLinkId: string;
  kind: TelegramChannelTrafficSourceKind;
  acquired: number;
  retained: number;
  unsubscribed: number;
};

export type TelegramChannelTrafficAttributionDetail =
  TelegramChannelTrafficAttributionPreview & {
    channelId: string;
    items: TelegramChannelTrafficAttributionItem[];
    points: TelegramChannelTrafficAttributionPoint[];
    historyTruncated: boolean;
    dataQualityNote: string;
  };
