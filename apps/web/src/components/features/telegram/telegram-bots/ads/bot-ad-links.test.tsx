import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BotAdLinkView } from "@telegram-system/shared";
import { BotAdCampaignSummary, BotAdLinks } from "./bot-ad-links";

describe("Bot Ads funnel", () => {
  it("displays each tracking metric with unknown post stats and uses the original placement for actions", () => {
    const link: BotAdLinkView = {
      id: "placement",
      title: "November launch",
      createdAt: "2026-11-24T08:00:00.000Z",
      url: "https://example.test/bot-ad-links/placement",
      campaignId: "campaign",
      promo: { id: "promo", title: "First campaign" },
      channel: { id: "channel", title: "Owned channel" },
      post: {
        id: "draft",
        status: "DRAFT",
        scheduledAt: null,
        publishedAt: null,
        url: null,
        requestedPublication: null,
      },
      views: null,
      reactions: null,
      clicks: 20,
      starts: 8,
      active: 3,
      retained: 2,
      paid: 1,
    };
    const onPublish = vi.fn();
    const onNewLink = vi.fn();
    render(
      <BotAdLinks
        links={[link]}
        onPublish={onPublish}
        onNewLink={onNewLink}
        placements
      />,
    );
    expect(screen.getByText("Views").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Link opens").nextElementSibling).toHaveTextContent(
      "20",
    );
    expect(screen.getByText("Bot starts").nextElementSibling).toHaveTextContent(
      "8",
    );
    expect(
      screen.getByText("First action").nextElementSibling,
    ).toHaveTextContent("3");
    expect(
      screen.getByText("Returned after 30 days").nextElementSibling,
    ).toHaveTextContent("2");
    expect(
      screen.getByText("Paid subscribers").nextElementSibling,
    ).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "New link" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onNewLink).toHaveBeenCalledWith(link);
    expect(onPublish).toHaveBeenCalledWith(link);
  });

  it("shows campaign totals even when the current page has no placements", () => {
    const { container } = render(
      <BotAdCampaignSummary
        totals={{
          placements: 52,
          published: 50,
          views: 157,
          reactions: 6,
          clicks: 67,
          starts: 34,
          active: 5,
          retained: 4,
          paid: 2,
        }}
      />,
    );
    expect(
      within(container).getByText("50 published · 52 placements"),
    ).toBeInTheDocument();
    expect(
      within(container).getByText("Views").nextElementSibling,
    ).toHaveTextContent("157");
  });
});
