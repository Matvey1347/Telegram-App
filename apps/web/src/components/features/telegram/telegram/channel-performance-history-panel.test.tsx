import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPerformanceHistoryPanel } from "./channel-performance-history-panel";

const queryState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState.value,
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { performanceHistory: vi.fn() },
}));

describe("ChannelPerformanceHistoryPanel", () => {
  beforeEach(() => {
    queryState.value = {
      isLoading: false,
      isError: false,
      data: {
        periodDays: 90,
        currency: "UAH",
        points: [
          {
            date: "2026-08-01T00:00:00.000Z",
            subscribers: 1_000,
            averageViews: 500,
            averageReactions: 20,
            invested: 1_000,
            revenue: 100,
            paybackPercent: 10,
          },
          {
            date: "2026-09-01T00:00:00.000Z",
            subscribers: 1_100,
            averageViews: 450,
            averageReactions: 18,
            invested: 1_100,
            revenue: 300,
            paybackPercent: 27.3,
          },
        ],
      },
    };
  });

  it("renders separate subscriber, views and payback charts", () => {
    render(<ChannelPerformanceHistoryPanel channelId="channel-1" days={90} />);

    expect(screen.getByText("Last 90 days")).toBeInTheDocument();
    expect(screen.getByText("Subscribers")).toBeInTheDocument();
    expect(screen.getByText("Average views")).toBeInTheDocument();
    expect(screen.getByText("Payback")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Payback uses cumulative actual spend and received revenue",
      ),
    ).toBeInTheDocument();
  });

  it("shows a useful error state instead of an empty graph", () => {
    queryState.value = { isLoading: false, isError: true };

    render(<ChannelPerformanceHistoryPanel channelId="channel-1" days={90} />);

    expect(
      screen.getByText(/Failed to load channel history/),
    ).toBeInTheDocument();
  });
});
