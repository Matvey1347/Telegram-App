import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrafficAttributionPreview,
} from "@telegram-system/shared";
import {
  NetworkDynamicsSummary,
  NetworkTrafficAttributionSummary,
} from "./telegram-network-insights";
import { telegramChannelNetworksApi } from "@/lib/api";

const trend: TelegramChannelAudienceTrend = {
  periodDays: 7,
  currentAt: "2026-10-08T00:00:00.000Z",
  baselineAt: "2026-10-01T00:00:00.000Z",
  metrics: {
    subscribers: {
      current: 9_940,
      previous: 10_000,
      absoluteChange: -60,
      percentChange: -0.6,
    },
    reach: {
      current: 5_275,
      previous: 5_000,
      absoluteChange: 275,
      percentChange: 5.5,
    },
    reactions: null,
  },
};

const traffic: TelegramChannelTrafficAttributionPreview = {
  observedAudience: {
    periodDays: 30,
    currentAt: "2026-10-10T00:00:00.000Z",
    baselineAt: "2026-09-10T00:00:00.000Z",
    metrics: {
      subscribers: {
        current: 9_940,
        previous: 10_000,
        absoluteChange: -60,
        percentChange: -0.6,
      },
      pendingJoinRequests: {
        current: 242,
        previous: 200,
        absoluteChange: 42,
        percentChange: 21,
      },
      reach: null,
      reactions: null,
    },
  },
  acquired: 126,
  retained: 124,
  unsubscribed: 2,
  unsubscribePercent: 1.6,
  spend: 0,
  averageSubscriberCost: null,
  retainedSubscriberCost: null,
  allTimePaid: {
    acquired: 100,
    retained: 80,
    spend: 400,
    averageSubscriberCost: 4,
    retainedSubscriberCost: 5,
  },
  currency: "UAH",
  sources: [
    {
      kind: "MUTUAL_PROMOTION",
      label: "Mutual promotion",
      sourceCount: 2,
      linkCount: 3,
      acquired: 126,
      retained: 124,
      unsubscribed: 2,
      unsubscribePercent: 1.6,
      spend: 0,
      averageSubscriberCost: null,
      retainedSubscriberCost: null,
      currency: "UAH",
    },
  ],
};

describe("network insight summaries", () => {
  it("shows network traffic with the same start/end audience table as a channel", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NetworkTrafficAttributionSummary
          networkId="system-all"
          networkName="All"
          traffic={traffic}
          trend={trend}
        />
      </QueryClientProvider>,
    );

    const summary = screen.getByRole("button", {
      name: "Open traffic attribution for All",
    });
    expect(summary).toHaveTextContent("Sep 10 – Oct 10");
    expect(summary).toHaveTextContent("SubsRequestsTotal");
    expect(summary).toHaveTextContent("Sep 1010,00020010,200");
    expect(summary).toHaveTextContent("Oct 109,94024210,182");
    expect(summary).toHaveTextContent("Difference-60+42-18");
  });

  it("opens aggregate network dynamics without referring to a member channel", async () => {
    vi.spyOn(
      telegramChannelNetworksApi,
      "performanceHistory",
    ).mockResolvedValue({
      range: "7d",
      periodDays: 7,
      currency: "UAH",
      points: [],
      comparisonPoint: null,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NetworkDynamicsSummary
          networkId="system-all"
          networkName="All"
          trend={trend}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open network dynamics for All" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("All · network dynamics");
    expect(telegramChannelNetworksApi.performanceHistory).toHaveBeenCalledWith(
      "system-all",
      "7d",
    );
  });

  it("opens aggregate traffic attribution with source totals", async () => {
    vi.spyOn(
      telegramChannelNetworksApi,
      "trafficAttribution",
    ).mockResolvedValue({
      ...traffic,
      channelId: "system-all",
      items: [],
      points: [],
      historyTruncated: false,
      dataQualityNote: "Network data",
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NetworkTrafficAttributionSummary
          networkId="system-all"
          networkName="All"
          traffic={traffic}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open traffic attribution for All" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("All · traffic attribution");
    expect(telegramChannelNetworksApi.trafficAttribution).toHaveBeenCalledWith(
      "system-all",
    );
  });
});
