import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramAdChannelAnalyticsResponse } from "@telegram-system/shared";
import { telegramAdSalesApi } from "@/lib/api";
import { TelegramChannelAdSalesSection } from "./telegram-channel-ad-sales-section";

vi.mock("@/lib/api", () => ({
  telegramAdSalesApi: { channelAnalytics: vi.fn() },
}));

const analytics = {
  channelId: "channel-1",
  title: "Channel",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-23",
  timezone: "Europe/Warsaw",
  dateRules: [],
  revenue: {
    currency: "UAH",
    totalAgreedRevenue: "0",
    totalPaidRevenue: "0",
    totalRevenueInPrimaryCurrency: "0",
    periodRevenue: "0",
    outstandingRevenue: "0",
    refundedRevenue: "0",
    averageSalePrice: "0",
    medianSalePrice: "0",
    elapsedMinimumRevenue: "0",
    elapsedSoldRevenue: "0",
    elapsedRevenueGap: "0",
  },
  placements: {
    sold: 0,
    published: 0,
    completed: 0,
    cancelled: 0,
    slotsEligible: 0,
    slotsAvailable: 0,
    slotsReserved: 0,
    slotFillRate: 0,
    bookingFillRate: 0,
    publishedFillRate: 0,
    cancellationRate: 0,
  },
  pricing: {
    currentExpectedViews: 0,
    currentRecommendedPrice: "0",
    currentMinimumPrice: "0",
    averageAgreedPrice: "0",
    averageDiscountFromRecommendedPercent: 0,
    underpricingAmount: "0",
    underpricingPercent: 0,
    lostPotentialRevenue: "0",
  },
  performance: {
    expectedViews: 0,
    actualViews24h: 0,
    actualViews48h: 0,
    actualViewsFinal: 0,
    expectedCpm: "0",
    actualCpm: "0",
    varianceExpectedVsActualPercent: 0,
  },
  operations: {
    upcomingPlacements: 0,
    upcomingDeletions: 0,
    overdueUnpaidSales: 0,
    missedPlacements: 0,
    deletionFailures: 0,
  },
  recentSales: [],
} satisfies TelegramAdChannelAnalyticsResponse;

describe("TelegramChannelAdSalesSection", () => {
  it("uses the channel overview panel style and renders an explicit empty sales row", async () => {
    vi.mocked(telegramAdSalesApi.channelAnalytics).mockResolvedValue(analytics);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <TelegramChannelAdSalesSection channelId="channel-1" />
      </QueryClientProvider>,
    );

    const panel = await screen.findByTestId("channel-ad-sales");
    expect(panel).toHaveClass(
      "rounded-lg",
      "border-slate-700",
      "bg-slate-950/20",
      "p-3",
    );
    expect(screen.getByText("No recent sales.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open full module" }),
    ).toHaveAttribute(
      "href",
      "/ad-sales/analytics?channelId=channel-1",
    );
    expect(
      screen.getByText("Recommended price").parentElement?.parentElement,
    ).toHaveClass(
      "min-h-[58px]",
      "rounded-lg",
      "border-slate-800",
      "bg-slate-900/25",
    );
  });
});
