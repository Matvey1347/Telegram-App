import type { TelegramChannelTrafficSourceKind } from "./telegram-channel-traffic-attribution";

export type DashboardRetainedEarnings = {
  reinvestedEarningsForPeriod?: number;
};

export type DashboardTrafficKind = Exclude<
  TelegramChannelTrafficSourceKind,
  "UNATTRIBUTED"
>;

export type DashboardTrafficSource = {
  kind: DashboardTrafficKind;
  trackedLinks: number;
  measuredLinks: number;
  arrivals: number | null;
  requests: number | null;
  joined: number | null;
  departures: number | null;
  departurePercent: number | null;
  spend: number | null;
  costPerRequest: number | null;
  costPerSubscriber: number | null;
};

export type DashboardSpendingMix = {
  advertising: number;
  channelPurchases: number;
  otherChannelExpenses: number;
};

export type DashboardSalesMix = {
  total: number;
  owner: number;
  otherSellers: number;
  unassigned: number;
  external: number;
  revenueBySeller?: {
    id: string | null;
    name: string | null;
    amount: number;
  }[];
};
