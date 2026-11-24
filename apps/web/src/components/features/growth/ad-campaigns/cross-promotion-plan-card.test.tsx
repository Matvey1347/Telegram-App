import { fireEvent, render, screen } from "@testing-library/react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionPlanCard } from "./cross-promotion-plan-card";
import { formatDateTime } from "@/lib/date-format";

vi.mock("@/hooks/use-workspace-timezone", () => ({
  useWorkspaceTimezone: () => "Europe/Kyiv",
}));
vi.mock("@/components/icons/icon-avatar", () => ({
  IconAvatar: ({
    label,
    icon,
  }: {
    label: string;
    icon?: { type?: string; value?: string } | null;
  }) => <span>{icon?.type === "unicode" ? icon.value : label}</span>,
}));

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
      inviteLinkId: "link-1",
      title: "Mentor",
      photoUrl: "https://cdn.example/promoted.jpg",
      promoId: "promo-1",
      promoTitle: "Calm mind",
      promoIconPresentation: { type: "unicode", value: "💎" },
      inviteLinkUrl: "https://t.me/+track",
      inviteLinkTotalJoinedCount: 20,
      inviteLinkTotalRequestedCount: 5,
      joinedCount: 10,
      requestedCount: 3,
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
  it("labels direct exchanges as VP", () => {
    render(<CrossPromotionPlanCard plan={plan} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("VP")).toBeInTheDocument();
  });

  it.each(["DIRECT_MUTUAL", "OWN_CHANNELS"] as const)(
    "keeps the date beside the title and the channel, metrics and promo in one row for %s",
    (kind) => {
      render(<CrossPromotionPlanCard plan={{ ...plan, kind }} onEdit={vi.fn()} onDelete={vi.fn()} />);
      const heading = screen.getByRole("heading", { name: plan.title });
      const date = screen.getByText(formatDateTime(plan.scheduledAt, undefined, "Europe/Kyiv"));
      expect(heading.parentElement?.nextElementSibling).toBe(date);
      expect(date).toHaveAttribute("datetime", plan.scheduledAt);
      const channel = screen.getByText("Mentor");
      const row = channel.parentElement?.parentElement;
      expect(screen.getByRole("img", { name: "During placement: +13" }).parentElement).toBe(row);
      expect(screen.getByRole("img", { name: "Actual views: 120" }).parentElement).toBe(row);
      expect(screen.getByText("Calm mind")).toHaveClass("truncate");
      expect(screen.getByText("Calm mind").parentElement?.parentElement).toBe(row);
      expect(screen.queryByText(/promoted/i)).not.toBeInTheDocument();
    },
  );

  it("renders only the publications owned by our workspace", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <CrossPromotionPlanCard
        plan={plan}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByAltText("Partner Client")).toHaveAttribute(
      "src",
      "https://cdn.example/client.jpg",
    );
    expect(screen.getByText("🤝")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.queryByText("My channels")).not.toBeInTheDocument();
    expect(screen.queryByText("Partner channels")).not.toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.queryByText(/promoted/i)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "During placement: +13" })).toHaveAttribute("title", "During placement: +13");
    expect(screen.getByText("+13")).toBeInTheDocument();
    expect(screen.queryByText(/total on link/)).not.toBeInTheDocument();
    expect(screen.queryByText(/joined.*requests/)).not.toBeInTheDocument();
    expect(screen.getByText("💎")).toBeInTheDocument();
    expect(screen.getByText("Calm mind")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mutual-promotion result"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Partner Publisher")).not.toBeInTheDocument();
    expect(screen.queryByText("Partner")).not.toBeInTheDocument();
    expect(screen.queryByText(/My publication:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tracking ends:/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Open scheduled post for My Publisher",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Actual views: 120" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Audience decline: −2" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "My channels: 1" }));
    expect(
      screen.getByRole("menu", { name: "My channels: 1" }),
    ).toHaveTextContent("My Publisher");

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Mentor ↔ Business" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Combine published cards" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Add new integration" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit promotion" }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Mentor ↔ Business" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("splits the total from our placements across the three promoted channels", () => {
    const targetResults = Array.from({ length: 3 }, (_, index) => ({
      ...plan.targetResults[0],
      telegramChannelId: `channel-${index}`,
      inviteLinkId: `link-${index}`,
      title: `Promoted channel ${index}`,
    }));
    render(<CrossPromotionPlanCard plan={{
      ...plan, targetResults,
      publisherResults: [{ ...plan.publisherResults[0], postViews: 7_801 }],
    }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByRole("img", { name: "Allocated placement views: 2,600" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Allocated placement views: 2,601" })).toBeInTheDocument();
  });

  it("opens the selected promo from the compact placement result", () => {
    const onOpenPromo = vi.fn();
    render(
      <CrossPromotionPlanCard
        plan={plan}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenPromo={onOpenPromo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Calm mind/ }));
    expect(onOpenPromo).toHaveBeenCalledWith("promo-1");
  });

  it("renders multiple results for the same channel without duplicate React keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const duplicateChannelPlan: CrossPromotionPlan = {
      ...plan,
      targetResults: [
        ...plan.targetResults,
        {
          ...plan.targetResults[0],
          inviteLinkId: "link-2",
          promoId: "promo-2",
          promoTitle: "Second placement",
        },
      ],
    };

    render(
      <CrossPromotionPlanCard
        plan={duplicateChannelPlan}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Mentor")).toHaveLength(2);
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes("Encountered two children with the same key"),
      ),
    ).toBe(false);
    consoleError.mockRestore();
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

  it("shows only the placement result after tracking is completed", () => {
    render(
      <CrossPromotionPlanCard
        plan={{ ...plan, status: "COMPLETED" }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "During placement: +13" })).toBeInTheDocument();
    expect(screen.getByText("+13")).toBeInTheDocument();
    expect(screen.queryByText(/at tracking end/)).not.toBeInTheDocument();
  });

  it("shows only owned publishing channels for own-channel promotion", () => {
    render(
      <CrossPromotionPlanCard
        plan={{ ...plan, kind: "OWN_CHANNELS" }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("My channels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My channels: 1" })).toBeInTheDocument();
    expect(screen.queryByText("Partner channels")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Partner channels/ })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "During placement: +13" })).toBeInTheDocument();
  });

  it("identifies still-published posts on a completed own-channel promotion", () => {
    render(
      <CrossPromotionPlanCard
        plan={{
          ...plan,
          kind: "OWN_CHANNELS",
          status: "COMPLETED",
          placementPostIds: [{ telegramChannelId: "mine-1", managedPostId: "post-1", isPublishedInTelegram: true }],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Posts remain published")).toBeVisible();
    expect(screen.getByRole("button", { name: "My channels: 1" })).toBeVisible();
    expect(screen.getByText("Mentor").parentElement).toHaveClass("border");
    expect(screen.getByText("Calm mind").parentElement).toHaveClass("border");
  });

  it("shows the actual own-channel placement time instead of a stale plan time", () => {
    const actualTime = "2026-09-21T15:10:00.000Z";
    render(
      <CrossPromotionPlanCard
        plan={{
          ...plan,
          kind: "OWN_CHANNELS",
          scheduledAt: "2026-09-21T06:10:00.000Z",
          publicationPost: {
            ...plan.publicationPost,
            publisherPlacements: [{ telegramChannelId: "mine-1", scheduledAt: actualTime }],
          },
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByText(formatDateTime(actualTime, undefined, "Europe/Kyiv")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        formatDateTime("2026-09-21T06:10:00.000Z", undefined, "Europe/Kyiv"),
      ),
    ).not.toBeInTheDocument();
  });

  it("shows direct-exchange times in the workspace timezone", () => {
    render(
      <CrossPromotionPlanCard
        plan={{
          ...plan,
          scheduledAt: "2026-10-02T15:10:00.000Z",
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        formatDateTime("2026-10-02T15:10:00.000Z", undefined, "Europe/Kyiv"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(formatDateTime("2026-10-02T15:10:00.000Z")),
    ).not.toBeInTheDocument();
  });
});
