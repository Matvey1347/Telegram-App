import { fireEvent, render, screen } from "@testing-library/react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPlanCard } from "./cross-promotion-plan-card";

const plan: CrossPromotionPlan = {
  id: "plan-1",
  iconPresentation: { type: "unicode", value: "🤝" },
  kind: "DIRECT_MUTUAL",
  title: "Mentor ↔ Business",
  advertiserId: "client-1",
  advertiser: {
    id: "client-1",
    displayName: "Partner Client",
    telegramUsername: "@partner",
    photoUrl: "https://cdn.example/client.jpg",
  },
  publisherChannelIds: ["mine-1"],
  partnerChannelIds: ["partner-1"],
  targets: [
    {
      telegramChannelId: "promoted-1",
      promoId: "promo-1",
      inviteLinkId: "link-1",
    },
  ],
  publicationPost: {
    title: "Partner post",
    text: "Post body",
    imageUrls: [],
    buttonRows: [],
    publisherPlacements: [
      {
        telegramChannelId: "mine-1",
        scheduledAt: "2026-09-15T08:00:00.000Z",
      },
    ],
    partnerPlacements: [
      {
        telegramChannelId: "partner-1",
        scheduledAt: "2026-09-15T14:00:00.000Z",
      },
    ],
  },
  scheduledAt: "2026-09-15T08:00:00.000Z",
  trackingEndsAt: null,
  status: "SCHEDULED",
  lastError: null,
  placementPostIds: [
    {
      telegramChannelId: "mine-1",
      managedPostId: "post-1",
      postGroupId: "group-1",
    },
  ],
  baselineTargetCounters: [],
  baselinePublisherSubscribers: [],
  targetResults: [
    {
      telegramChannelId: "promoted-1",
      title: "Mentor",
      photoUrl: "https://cdn.example/promoted.jpg",
      promoTitle: "Calm mind",
      inviteLinkUrl: "https://t.me/+track",
      joinedCount: 4,
      requestedCount: 1,
    },
  ],
  publisherResults: [
    {
      telegramChannelId: "mine-1",
      title: "My Publisher",
      photoUrl: "https://cdn.example/mine.jpg",
      subscribersLost: 2,
      postViews: 120,
      postReactions: 8,
    },
  ],
  partnerResults: [
    {
      telegramChannelId: "partner-1",
      title: "Partner Publisher",
      photoUrl: "https://cdn.example/partner.jpg",
    },
  ],
  createdAt: "2026-09-13T10:00:00.000Z",
  updatedAt: "2026-09-13T10:00:00.000Z",
};

describe("CrossPromotionPlanCard", () => {
  it("renders only the publications owned by our workspace", () => {
    const onEdit = vi.fn();
    const onCopy = vi.fn();
    render(
      <CrossPromotionPlanCard
        plan={plan}
        clock={new Date("2026-09-14T08:00:00.000Z").getTime()}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Partner Client")).toHaveAttribute(
      "src",
      "https://cdn.example/client.jpg",
    );
    expect(screen.getByText("🤝")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("My channels")).toBeInTheDocument();
    expect(screen.queryByText("Partner channels")).not.toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByText("Promoted")).toBeInTheDocument();
    expect(screen.queryByText("Partner Publisher")).not.toBeInTheDocument();
    expect(screen.queryByText("Partner")).not.toBeInTheDocument();
    expect(screen.queryByText(/My publication:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tracking ends:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open scheduled post for My Publisher",
      }),
    ).toHaveAttribute("href", "/telegram-posts/mine-1/editor?postId=post-1");
    expect(screen.getAllByText(/^in /)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "My channels: 1" }));
    expect(
      screen.getByRole("menu", { name: "My channels: 1" }),
    ).toHaveTextContent("My Publisher");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Mentor ↔ Business" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Duplicate mutual promotion" }),
    );
    expect(onCopy).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Mentor ↔ Business" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit promotion" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a CRM username already used as the client name", () => {
    render(
      <CrossPromotionPlanCard
        plan={{
          ...plan,
          advertiser: {
            ...plan.advertiser!,
            displayName: "@A20_admin",
            telegramUsername: "a20_admin",
            photoUrl: null,
          },
        }}
        clock={null}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("@A20_admin")).toBeInTheDocument();
    expect(screen.queryByText(/· @?a20_admin/i)).not.toBeInTheDocument();
    expect(screen.getByAltText("@A20_admin")).toHaveAttribute(
      "src",
      "https://t.me/i/userpic/320/a20_admin.jpg",
    );
  });
});
