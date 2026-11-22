import { render, screen } from "@testing-library/react";
import type { CrossPromotionPlan, TelegramAdProduct } from "@telegram-system/shared";
import { expect, it } from "vitest";
import { CrossPromotionPlanSummary } from "./cross-promotion-plan-summary";

const products = {
  publisher: [{ id: "short", estimatedViews: 8_000 }, { id: "long", estimatedViews: 12_000 }],
  partner: [{ id: "other", estimatedViews: 30_000 }],
} as unknown as Record<string, TelegramAdProduct[]>;

it("counts repeat placements and totals the estimates for the chosen format on each side", () => {
  render(<CrossPromotionPlanSummary
    kind="DIRECT_MUTUAL"
    publisherIds={["publisher", "without-format"]}
    publisherSettings={{ formatIds: { publisher: "short" }, times: {} }}
    additionalPublisherPosts={[{ settings: { formatIds: { publisher: "long" }, times: {} } }]}
    partnerIds={["partner"]}
    partnerSettings={{ formatIds: { partner: "other" }, times: {} }}
    productsByChannelId={products}
    initial={null}
  />);

  expect(screen.getByText("My placements").parentElement).toHaveTextContent("4");
  expect(screen.getByText("Partner placements").parentElement).toHaveTextContent("1");
  expect(screen.getByText(`≈ ${(20_000).toLocaleString()}`)).toBeInTheDocument();
  expect(screen.getByText(`≈ ${(30_000).toLocaleString()}`)).toBeInTheDocument();
  expect(screen.getByText("2 of 4 placements estimated")).toBeInTheDocument();
});

it("shows actual conversion for an own-channel promotion with one measured link", () => {
  const initial = {
    status: "COMPLETED",
    publisherResults: [{ postViews: 20_000 }],
    targetResults: [{ joinedCount: 30, requestedCount: 5 }],
  } as unknown as CrossPromotionPlan;
  render(<CrossPromotionPlanSummary
    kind="OWN_CHANNELS"
    publisherIds={["publisher"]}
    publisherSettings={{ formatIds: { publisher: "short" }, times: {} }}
    additionalPublisherPosts={[]}
    partnerIds={[]}
    partnerSettings={{ formatIds: {}, times: {} }}
    productsByChannelId={products}
    initial={initial}
  />);

  expect(screen.queryByText("Partner placements")).not.toBeInTheDocument();
  expect(screen.getByText("Joined via invite").parentElement).toHaveTextContent("30");
  expect(screen.getByText("Joins per view").parentElement).toHaveTextContent(
    new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }).format(30 / 20_000),
  );
});
