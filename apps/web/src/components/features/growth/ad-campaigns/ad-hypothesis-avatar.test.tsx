import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdHypothesis } from "@/lib/api";
import { AdHypothesisAvatar } from "./ad-hypothesis-avatar";

const baseHypothesis: AdHypothesis = {
  id: "system:channel:channel-1",
  name: "Business",
  status: "testing",
  createdAt: "2026-09-13T10:00:00.000Z",
  updatedAt: "2026-09-13T10:00:00.000Z",
  campaignsCount: 0,
  isSystem: true,
  systemScope: { kind: "channel", channelId: "channel-1" },
  summary: {
    campaignsCount: 0,
    totalSpend: 0,
    totalJoinedSubscribers: 0,
    totalPendingSubscribers: 0,
    totalAttributedSubscribers: 0,
    kpiStatus: "unknown",
    decision: "Not enough data yet.",
  },
};

describe("AdHypothesisAvatar", () => {
  it("shows the Telegram channel photo for a system channel hypothesis", () => {
    render(
      <AdHypothesisAvatar
        hypothesis={{
          ...baseHypothesis,
          telegramChannelId: "channel-1",
          telegramChannel: {
            id: "channel-1",
            title: "Business",
            isActive: true,
            photoUrl: "https://cdn.example/channel.jpg",
          },
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Business" })).toHaveAttribute(
      "src",
      "https://cdn.example/channel.jpg",
    );
  });

  it("uses the shared channel fallback when Telegram has no photo", () => {
    render(
      <AdHypothesisAvatar
        hypothesis={{
          ...baseHypothesis,
          telegramChannelId: "channel-1",
          telegramChannel: {
            id: "channel-1",
            title: "Business",
            isActive: true,
          },
        }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("CH")).toBeInTheDocument();
  });
});
