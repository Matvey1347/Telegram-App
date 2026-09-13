export type TelegramChannelTrendMetric = {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number | null;
};

export type TelegramChannelAudienceTrend = {
  periodDays: number;
  currentAt: string;
  baselineAt: string;
  metrics: {
    subscribers: TelegramChannelTrendMetric | null;
    reach: TelegramChannelTrendMetric | null;
    reactions: TelegramChannelTrendMetric | null;
  };
};

export type TelegramChannelPerformanceHistoryPoint = {
  date: string;
  subscribers: number | null;
  averageViews: number | null;
  averageReactions: number | null;
  postsPublished: number | null;
  invested: number;
  revenue: number;
  paybackPercent: number | null;
  adsLeft: number | null;
};

export type TelegramChannelPerformanceHistoryRange =
  | "1d"
  | "7d"
  | "30d"
  | "90d"
  | "all";

export type TelegramChannelPerformanceHistory = {
  range: TelegramChannelPerformanceHistoryRange;
  periodDays: 1 | 7 | 30 | 90 | null;
  currency: string;
  points: TelegramChannelPerformanceHistoryPoint[];
  comparisonPoint: {
    date: string;
    subscribers: number | null;
    averageViews: number | null;
    averageReactions: number | null;
  } | null;
};
