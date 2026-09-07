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
  invested: number;
  revenue: number;
  paybackPercent: number | null;
};

export type TelegramChannelPerformanceHistory = {
  periodDays: number;
  currency: string;
  points: TelegramChannelPerformanceHistoryPoint[];
};
