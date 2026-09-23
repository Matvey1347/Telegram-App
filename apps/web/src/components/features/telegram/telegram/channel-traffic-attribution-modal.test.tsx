import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramChannelsApi } from "@/lib/api";
import {
  ChannelTrafficAttributionModal,
  pivotTrafficAttributionPoints,
} from "./channel-traffic-attribution-modal";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CartesianGrid: () => null,
  Legend: () => null,
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="chart-line">{dataKey}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("./telegram-entity-avatar", () => ({
  TelegramEntityAvatar: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChannelTrafficAttributionModal
        channel={{ id: "channel-1", title: "Freudzone" } as never}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

const emptyDetail = {
  channelId: "channel-1",
  acquired: 0,
  retained: 0,
  unsubscribed: 0,
  unsubscribePercent: 0,
  spend: null,
  averageSubscriberCost: null,
  retainedSubscriberCost: null,
  currency: "USD",
  sources: [],
  items: [],
  points: [],
  historyTruncated: false,
  dataQualityNote: "Counters are collected during channel sync.",
} as const;

describe("ChannelTrafficAttributionModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves modal geometry while attribution is loading", () => {
    vi.spyOn(telegramChannelsApi, "trafficAttribution").mockImplementation(
      () => new Promise(() => undefined),
    );

    renderModal();

    expect(
      screen.getByLabelText("Loading traffic attribution"),
    ).toBeInTheDocument();
  });

  it("keeps only the selected invite link in the chart data", () => {
    const rows = pivotTrafficAttributionPoints(
      [
        {
          at: "2026-09-01T00:00:00.000Z",
          inviteLinkId: "ad-link",
          kind: "AD_CAMPAIGNS",
          acquired: 10,
          retained: 10,
          unsubscribed: 0,
        },
        {
          at: "2026-09-01T00:00:00.000Z",
          inviteLinkId: "bot-link",
          kind: "BOT",
          acquired: 4,
          retained: 4,
          unsubscribed: 0,
        },
      ],
      "ad-link",
    );

    expect(rows).toEqual([{ date: "2026-09-01", AD_CAMPAIGNS: 10 }]);
  });

  it("offers a retry after failure and explains an empty result", async () => {
    vi.spyOn(telegramChannelsApi, "trafficAttribution")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(emptyDetail);

    renderModal();

    expect(
      await screen.findByText("Could not load traffic attribution."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText(
        "No attributed traffic sources are available for this channel yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Counters are collected during channel sync."),
    ).toBeInTheDocument();
  });

  it("renders source detail in the shared responsive table", async () => {
    vi.spyOn(telegramChannelsApi, "trafficAttribution").mockResolvedValue({
      ...emptyDetail,
      acquired: 20,
      retained: 15,
      unsubscribed: 5,
      unsubscribePercent: 25,
      spend: 100,
      averageSubscriberCost: 5,
      retainedSubscriberCost: 6.67,
      sources: [
        {
          kind: "AD_CAMPAIGNS",
          label: "Ad campaigns",
          sourceCount: 1,
          linkCount: 1,
          acquired: 20,
          retained: 15,
          unsubscribed: 5,
          unsubscribePercent: 25,
          spend: 100,
          averageSubscriberCost: 5,
          retainedSubscriberCost: 6.67,
          currency: "USD",
        },
      ],
      items: [
        {
          id: "campaign:1",
          kind: "AD_CAMPAIGNS",
          title: "September placement",
          subtitle: "ACTIVE",
          inviteLinkIds: ["link-1"],
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: null,
          acquired: 20,
          retained: 15,
          unsubscribed: 5,
          unsubscribePercent: 25,
          spend: 100,
          averageSubscriberCost: 5,
          retainedSubscriberCost: 6.67,
          currency: "USD",
        },
      ],
      points: [
        {
          at: "2026-09-01T00:00:00.000Z",
          kind: "AD_CAMPAIGNS",
          acquired: 10,
          retained: 10,
          unsubscribed: 0,
        },
        {
          at: "2026-09-02T00:00:00.000Z",
          kind: "AD_CAMPAIGNS",
          acquired: 20,
          retained: 15,
          unsubscribed: 5,
        },
      ],
    });

    renderModal();

    expect(await screen.findAllByText("September placement")).toHaveLength(2);
    expect(
      screen.getByText("Attributed invite counters by source"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Peak" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".table-scroll")).not.toBeNull();
  });

  it("shows only the selected source on the chart", async () => {
    vi.spyOn(telegramChannelsApi, "trafficAttribution").mockResolvedValue({
      ...emptyDetail,
      sources: [
        {
          kind: "AD_CAMPAIGNS",
          label: "Ad campaigns",
          sourceCount: 1,
          linkCount: 1,
          acquired: 20,
          retained: 15,
          unsubscribed: 5,
          unsubscribePercent: 25,
          spend: 100,
          averageSubscriberCost: 5,
          retainedSubscriberCost: 6.67,
          currency: "USD",
        },
        {
          kind: "FOLDERS",
          label: "Folders",
          sourceCount: 1,
          linkCount: 1,
          acquired: 4,
          retained: 4,
          unsubscribed: 0,
          unsubscribePercent: 0,
          spend: null,
          averageSubscriberCost: null,
          retainedSubscriberCost: null,
          currency: "USD",
        },
      ],
      items: [],
      points: [
        {
          at: "2026-09-01T00:00:00.000Z",
          kind: "AD_CAMPAIGNS",
          acquired: 10,
          retained: 10,
          unsubscribed: 0,
        },
        {
          at: "2026-09-01T00:00:00.000Z",
          kind: "FOLDERS",
          acquired: 4,
          retained: 4,
          unsubscribed: 0,
        },
        {
          at: "2026-09-02T00:00:00.000Z",
          kind: "AD_CAMPAIGNS",
          acquired: 20,
          retained: 15,
          unsubscribed: 5,
        },
      ],
    });

    renderModal();

    expect(await screen.findAllByTestId("chart-line")).toHaveLength(2);
    await userEvent.click(screen.getByRole("tab", { name: /Folders · 4/ }));

    expect(screen.getByText("Folders invite counters")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart-line")).toHaveLength(1);
    expect(screen.getByTestId("chart-line")).toHaveTextContent("FOLDERS");
  });
});
