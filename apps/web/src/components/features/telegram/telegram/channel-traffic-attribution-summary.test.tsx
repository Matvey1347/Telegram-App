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
              trafficAttribution: {
                acquired: 1234,
                retained: 1000,
                unsubscribed: 234,
                unsubscribePercent: 18.96,
                spend: 500,
                averageSubscriberCost: 0.405,
                retainedSubscriberCost: 0.5,
                currency: "USD",
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
    expect(summary).toHaveTextContent(/Lost[\s\S]*234[\s\S]*19%/);
    expect(screen.getByText("0.5 USD")).toHaveClass("text-rose-300");
    expect(summary).not.toHaveTextContent("Details");
    expect(summary).not.toHaveTextContent("Ad campaigns");

    await userEvent.hover(screen.getByRole("button", { name: /Paid CPA 0.5 USD/i }));

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
                sources: [],
              },
            },
          } as never
        }
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
