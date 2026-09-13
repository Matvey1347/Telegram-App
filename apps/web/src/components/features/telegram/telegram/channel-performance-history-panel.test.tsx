import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPerformanceHistoryPanel } from "./channel-performance-history-panel";

const queryState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  lastOptions: null as null | { queryKey: readonly unknown[] },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    queryState.lastOptions = options;
    if (options.queryKey.at(-1) === "90d") {
      return { isLoading: false, isFetching: true, isError: false };
    }
    return queryState.value;
  },
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { performanceHistory: vi.fn() },
}));

describe("ChannelPerformanceHistoryPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    queryState.lastOptions = null;
    queryState.value = {
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        range: "30d",
        periodDays: 30,
        currency: "UAH",
        points: [
          {
            date: "2026-09-01T00:00:00.000Z",
            subscribers: 1_000,
            averageViews: 500,
            averageReactions: 20,
            postsPublished: 2,
            invested: 1_000,
            revenue: 100,
            paybackPercent: 10,
            adsLeft: 6,
          },
          {
            date: "2026-09-07T00:00:00.000Z",
            subscribers: 1_100,
            averageViews: 450,
            averageReactions: 18,
            postsPublished: 3,
            invested: 1_100,
            revenue: 300,
            paybackPercent: 27.3,
            adsLeft: 5,
          },
        ],
      },
    };
  });

  it("defaults to 30 days and renders the four explained charts", () => {
    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);

    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getAllByText("Subscribers").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("24h average post reach").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Payback").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ads left").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/measured at the same post age/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Second half average versus first half/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("+100 · +10.0%")).toBeInTheDocument();
    expect(screen.getByText("from 1,000")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Data available from Sep 1, 2026/).length,
    ).toBeGreaterThan(0);
    expect(queryState.lastOptions?.queryKey.at(-1)).toBe("30d");
  });

  it("shows today's recorded values without meaningless comparisons", async () => {
    const data = queryState.value.data as {
      points: Array<Record<string, number | string | null>>;
    };
    data.points = [
      {
        date: "2026-09-10T00:00:00.000Z",
        subscribers: 12_330,
        averageViews: 714,
        averageReactions: 8,
        postsPublished: 1,
        invested: 1_000,
        revenue: 25,
        paybackPercent: 2.5,
        adsLeft: 105,
      },
    ];

    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByText("12,330")).toBeInTheDocument();
    expect(screen.getByText("714.0")).toBeInTheDocument();
    expect(screen.getByText("8.0")).toBeInTheDocument();
    expect(screen.queryByText("No comparable data")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Second half average versus first half"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0 · 0.0%")).not.toBeInTheDocument();
    expect(screen.queryByText("Subscribers 0.0%")).not.toBeInTheDocument();
  });

  it("compares today's latest values with yesterday's final values", async () => {
    const data = queryState.value.data as {
      points: Array<Record<string, number | string | null>>;
      comparisonPoint: Record<string, number | string | null> | null;
    };
    data.points = [
      {
        date: "2026-09-10T10:00:00.000Z",
        subscribers: 12_330,
        averageViews: 714,
        averageReactions: 8,
        postsPublished: 1,
        invested: 1_000,
        revenue: 25,
        paybackPercent: 2.5,
        adsLeft: 105,
      },
    ];
    data.comparisonPoint = {
      date: "2026-09-09T20:00:00.000Z",
      subscribers: 12_300,
      averageViews: 700,
      averageReactions: 10,
    };

    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getAllByText("Today versus yesterday")).toHaveLength(3);
    expect(screen.getByText("+30 · +0.2%")).toBeInTheDocument();
    expect(screen.getByText("+14.0 · +2.0%")).toBeInTheDocument();
    expect(screen.getByText("-2.0 · -20.0%")).toBeInTheDocument();
  });

  it("shows the exact subscriber loss for the selected period", () => {
    const data = queryState.value.data as {
      points: Array<Record<string, number | string | null>>;
    };
    data.points[1].subscribers = 900;

    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);

    expect(screen.getByText("-100 · -10.0%")).toBeInTheDocument();
  });

  it("offers today and week periods for the entire dynamics view", async () => {
    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Today", { selector: "h4" })).toBeInTheDocument();
    expect(queryState.lastOptions?.queryKey.at(-1)).toBe("1d");

    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(queryState.lastOptions?.queryKey.at(-1)).toBe("7d");
  });

  it("remembers one selected period across every channel", async () => {
    const user = userEvent.setup();
    const view = render(
      <ChannelPerformanceHistoryPanel channelId="channel-1" />,
    );

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(window.localStorage.getItem("telegram-channel-dynamics:range")).toBe(
      "1d",
    );

    view.unmount();
    render(<ChannelPerformanceHistoryPanel channelId="channel-2" />);

    expect(screen.getByText("Today", { selector: "h4" })).toBeInTheDocument();
    expect(queryState.lastOptions?.queryKey.at(-1)).toBe("1d");
  });

  it("shows chart-sized skeletons while switching the period", async () => {
    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);

    await userEvent.click(screen.getByRole("button", { name: "90 days" }));

    expect(screen.getByText("Last 90 days")).toBeInTheDocument();
    const skeleton = screen.getByRole("status", {
      name: "Loading channel dynamics",
    });
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      10,
    );
    expect(screen.getAllByTestId("history-metric-skeleton")).toHaveLength(3);
    expect(screen.getAllByTestId("history-chart-skeleton")).toHaveLength(4);
    expect(queryState.lastOptions?.queryKey.at(-1)).toBe("90d");
  });

  it("shows a useful error state instead of an empty graph", () => {
    queryState.value = {
      isLoading: false,
      isFetching: false,
      isError: true,
    };

    render(<ChannelPerformanceHistoryPanel channelId="channel-1" />);

    expect(
      screen.getByText(/Failed to load channel history/),
    ).toBeInTheDocument();
  });
});
