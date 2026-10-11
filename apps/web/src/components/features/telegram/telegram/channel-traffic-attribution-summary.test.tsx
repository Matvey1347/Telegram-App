import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChannelTrafficAttributionSummary } from "./channel-traffic-attribution-summary";

vi.mock("next/dynamic", () => ({
  default: () =>
    function TrafficDetails({ channel }: { channel: { title: string } }) {
      return <div role="dialog">Traffic details for {channel.title}</div>;
    },
}));

describe("ChannelTrafficAttributionSummary", () => {
  it("shows compact attribution totals and opens channel details", async () => {
    render(
      <ChannelTrafficAttributionSummary
        channel={
          {
            id: "channel-1",
            title: "Freudzone",
            targetCpa: 0.4,
            kpiCurrency: "USD",
            preview: {
              audienceTrend: {
                periodDays: 30,
                currentAt: "2026-10-10T00:00:00.000Z",
                baselineAt: "2026-09-10T00:00:00.000Z",
                metrics: {
                  subscribers: {
                    current: 23_000,
                    previous: 24_000,
                    absoluteChange: -1_000,
                    percentChange: -4.2,
                  },
                  pendingJoinRequests: {
                    current: 1_000,
                    previous: 0,
                    absoluteChange: 1_000,
                    percentChange: null,
                  },
                  reach: null,
                  reactions: null,
                },
              },
              trafficAttribution: {
                observedAudience: {
                  periodDays: 30,
                  currentAt: "2026-10-10T00:00:00.000Z",
                  baselineAt: "2026-09-10T00:00:00.000Z",
                  metrics: {
                    subscribers: {
                      current: 23_000,
                      previous: 24_000,
                      absoluteChange: -1_000,
                      percentChange: -4.2,
                    },
                    pendingJoinRequests: {
                      current: 1_000,
                      previous: 0,
                      absoluteChange: 1_000,
                      percentChange: null,
                    },
                    reach: null,
                    reactions: null,
                  },
                },
                acquired: 1234,
                retained: 1000,
                unsubscribed: 234,
                unsubscribePercent: 18.96,
                spend: 500,
                averageSubscriberCost: 0.405,
                retainedSubscriberCost: 4.2,
                allTimePaid: {
                  acquired: 1234,
                  retained: 1000,
                  spend: 500,
                  averageSubscriberCost: 0.405,
                  retainedSubscriberCost: 0.5,
                },
                currency: "USD",
                attributionPeriod: {
                  startsAt: "2026-09-20T00:00:00.000Z",
                  endsAt: null,
                },
                sources: [
                  {
                    kind: "AD_CAMPAIGNS",
                    label: "Ad campaigns",
                    sourceCount: 2,
                    linkCount: 2,
                    acquired: 1234,
                    retained: 1000,
                    unsubscribed: 234,
                    unsubscribePercent: 18.96,
                    spend: 500,
                    averageSubscriberCost: 0.405,
                    retainedSubscriberCost: 0.5,
                    currency: "USD",
                  },
                ],
              },
            },
          } as never
        }
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Open traffic attribution for Freudzone",
      }),
    ).toBeInTheDocument();
    const summary = screen.getByText("Traffic sources").closest("section");
    expect(summary).toHaveTextContent(/Acquired[\s\S]*1[,.]?234/);
    expect(summary).toHaveTextContent(/Lost[\s\S]*234/);
    expect(summary).not.toHaveTextContent("19%");
    expect(summary).not.toHaveTextContent("Channels");
    expect(screen.getByText("Sep 10 – Oct 10")).toBeInTheDocument();
    expect(summary).toHaveTextContent("Sep 1024,000024,000");
    expect(summary).toHaveTextContent("Oct 1023,0001,00024,000");
    expect(summary).toHaveTextContent("Difference-1,000+1,0000");
    expect(screen.getByText("0.5 USD")).toHaveClass("text-rose-300");
    expect(summary).not.toHaveTextContent("Details");
    expect(summary).not.toHaveTextContent("Ad campaigns");
    expect(summary).not.toHaveTextContent(/Since Sep 20/);

    await userEvent.hover(
      screen.getByRole("button", { name: /Paid CPA 0.5 USD/i }),
    );

    expect(await screen.findByText("KPI (USD)")).toBeInTheDocument();
    expect(screen.getByText("target to 0.4 USD")).toBeInTheDocument();
    expect(screen.getByText("ok —")).toBeInTheDocument();
    expect(screen.getByText("stop —")).toBeInTheDocument();

    await userEvent.click(summary!);

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Traffic details for Freudzone",
    );
  });

  it("does not add an empty analytics block to the channel card", () => {
    const { container } = render(
      <ChannelTrafficAttributionSummary
        channel={
          {
            id: "channel-1",
            title: "No attributed traffic",
            preview: {
              trafficAttribution: {
                observedAudience: {
                  periodDays: 23,
                  currentAt: "2026-10-10T00:00:00.000Z",
                  baselineAt: "2026-09-17T00:00:00.000Z",
                  metrics: {
                    subscribers: {
                      current: 24_316,
                      previous: 24_875,
                      absoluteChange: -559,
                      percentChange: -2.2,
                    },
                    pendingJoinRequests: null,
                    reach: null,
                    reactions: null,
                  },
                },
                sources: [],
              },
            },
          } as never
        }
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a card usable with an older cached API response", () => {
    render(
      <ChannelTrafficAttributionSummary
        channel={
          {
            id: "channel-1",
            title: "Legacy response",
            preview: {
              trafficAttribution: {
                acquired: 10,
                retained: 8,
                unsubscribed: 2,
                unsubscribePercent: 20,
                spend: 80,
                averageSubscriberCost: 8,
                retainedSubscriberCost: 10,
                currency: "USD",
                sources: [{ kind: "AD_CAMPAIGNS", label: "Ad campaigns" }],
              },
            },
          } as never
        }
      />,
    );

    expect(screen.getByText("10 USD")).toBeInTheDocument();
  });

  it("uses zero for a missing request baseline so totals and growth remain visible", () => {
    render(
      <ChannelTrafficAttributionSummary
        channel={
          {
            id: "channel-1",
            title: "Recently observed",
            preview: {
              audienceTrend: {
                periodDays: 30,
                currentAt: "2026-10-10T00:00:00.000Z",
                baselineAt: "2026-09-17T00:00:00.000Z",
                metrics: {
                  subscribers: {
                    current: 24_316,
                    previous: 24_875,
                    absoluteChange: -559,
                    percentChange: -2.2,
                  },
                  pendingJoinRequests: null,
                  reach: null,
                  reactions: null,
                },
              },
              bookingSchedule: {
                pendingJoinRequests: 616,
                futureScheduledTotal: 0,
                draftTotal: 0,
                lastScheduledAt: null,
              },
              trafficAttribution: {
                observedAudience: {
                  periodDays: 23,
                  currentAt: "2026-10-10T00:00:00.000Z",
                  baselineAt: "2026-09-17T00:00:00.000Z",
                  metrics: {
                    subscribers: {
                      current: 24_316,
                      previous: 24_875,
                      absoluteChange: -559,
                      percentChange: -2.2,
                    },
                    pendingJoinRequests: null,
                    reach: null,
                    reactions: null,
                  },
                },
                acquired: 1,
                retained: 1,
                unsubscribed: 0,
                unsubscribePercent: 0,
                spend: 0,
                averageSubscriberCost: null,
                retainedSubscriberCost: null,
                currency: "USD",
                sources: [{ kind: "AD_CAMPAIGNS", label: "Ad campaigns" }],
              },
            },
          } as never
        }
      />,
    );

    const summary = screen.getByText("Traffic sources").closest("section");
    expect(screen.getByText("Sep 17 – Oct 10")).toBeInTheDocument();
    expect(summary).toHaveTextContent("Sep 1724,875024,875");
    expect(summary).toHaveTextContent("Oct 1024,31661624,932");
    expect(summary).toHaveTextContent("Difference-559+616+57");
  });
});
