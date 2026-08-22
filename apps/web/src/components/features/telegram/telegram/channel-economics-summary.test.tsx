import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TelegramChannel } from "@/lib/api";
import { ChannelEconomicsEditor } from "./channel-economics-editor";
import {
  ChannelEconomicsSummary,
  sortChannelsByScale,
} from "./channel-economics-summary";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { updateQuiet: vi.fn() },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

describe("ChannelEconomicsSummary", () => {
  it("sorts channel cards by audience scale", () => {
    const channels = [
      { id: "test", title: "Test", currentSubscribersCount: 3 },
      {
        id: "largest",
        title: "Largest",
        currentSubscribersCount: 100,
        preview: { audience: { subscribersCount: 11_695 } },
      },
      { id: "middle", title: "Middle", currentSubscribersCount: 7_719 },
    ] as TelegramChannel[];

    expect(sortChannelsByScale(channels).map((channel) => channel.id)).toEqual([
      "largest",
      "middle",
      "test",
    ]);
    expect(channels.map((channel) => channel.id)).toEqual([
      "test",
      "largest",
      "middle",
    ]);
  });

  it("shows combined spend with a detailed tooltip and format prices", async () => {
    render(
      <ChannelEconomicsSummary
        channel={
          {
            id: "channel-1",
            title: "Mentor",
            currentSubscribersCount: 7_719,
            adBaseCpm: 300,
            adBaseCurrency: "UAH",
            preview: {
              audience: {
                subscribersCount: 7_719,
                activeSubscribersEstimate: 500,
                viewRate: 7.3,
              },
              financialSummary: {
                currency: "UAH",
                totalAttributedSubscribers: 80,
                totalPendingSubscribers: 2_281,
                avgCpa: 56.25,
                paidActiveSubscribersEstimate: 60,
                activeCpa: 75,
                assetEconomics: {
                  currency: "UAH",
                  purchasePrice: 25_000,
                  adSpend: 4_500,
                  revenue: 8_000,
                  invested: 29_500,
                  remainingToBreakEven: 21_500,
                  paybackPercent: 27.1,
                  adsSold: 1,
                  estimatedAdPrice: 1_695,
                  estimatedAdsRemaining: 13,
                  conversionUnavailable: false,
                  formatPricing: {
                    currency: "UAH",
                    cpm: 300,
                    h24: {
                      expectedViews: 124,
                      estimatedPrice: 37.2,
                      postsSampleCount: 3,
                      dataQuality: "READY",
                    },
                    h48: {
                      expectedViews: 168,
                      estimatedPrice: 50.4,
                      postsSampleCount: 3,
                      dataQuality: "READY",
                    },
                    h72: {
                      expectedViews: 178,
                      estimatedPrice: 53.4,
                      postsSampleCount: 3,
                      dataQuality: "READY",
                    },
                    permanent: {
                      expectedViews: 244,
                      estimatedPrice: 73.2,
                      postsSampleCount: 3,
                      dataQuality: "READY",
                    },
                  },
                },
              },
            },
          } as never
        }
      />,
    );

    expect(screen.getByText("29.500 UAH")).toBeInTheDocument();
    expect(screen.queryByText("21.500 UAH remaining")).not.toBeInTheDocument();
    expect(screen.queryByText("Channel economics")).not.toBeInTheDocument();
    expect(screen.getByText("8.000 UAH")).toBeInTheDocument();
    expect(screen.queryByText("1.695 UAH")).not.toBeInTheDocument();
    expect(screen.getByText("1/24")).toBeInTheDocument();
    expect(screen.queryByText("3/72")).not.toBeInTheDocument();
    expect(screen.getByText("124 views")).toBeInTheDocument();
    expect(screen.getByText("37.2 UAH")).toBeInTheDocument();
    expect(screen.getByText("No delete")).toBeInTheDocument();
    expect(screen.getByText("244 views")).toBeInTheDocument();
    expect(screen.getByText("73.2 UAH")).toBeInTheDocument();
    expect(screen.getByText("3.0 UAH")).toBeInTheDocument();
    expect(screen.getByText("59.0 UAH")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Sub").parentElement).toHaveClass("flex");
    expect(screen.getByText("Sub").parentElement).not.toHaveClass(
      "inline-flex",
    );
    expect(
      screen
        .getByText("Spend")
        .parentElement?.querySelector(".lucide-circle-minus"),
    ).toHaveClass("text-rose-400");
    expect(screen.queryByText("Audience")).not.toBeInTheDocument();
    expect(screen.getByText("CPM 300.00 UAH")).toBeInTheDocument();
    expect(screen.getByText("13").tagName).toBe("STRONG");
    expect(screen.getByText("ads to break even")).toBeInTheDocument();

    await userEvent.hover(
      screen.getByRole("button", { name: "Show spend breakdown" }),
    );
    expect(await screen.findByText("Bought for")).toBeInTheDocument();
    expect(screen.getByText("25.000 UAH")).toBeInTheDocument();
    expect(screen.getByText("Ad spend")).toBeInTheDocument();
    expect(screen.getByText("4.500 UAH")).toBeInTheDocument();
  });

  it("uses the unclipped portal select with the concise Currency label", async () => {
    render(
      <ChannelEconomicsEditor
        channel={
          {
            id: "channel-1",
            title: "Mentor",
            adBaseCurrency: "USD",
            preview: { financialSummary: {} },
          } as never
        }
        currencySettings={
          {
            primaryCurrency: "USD",
            supportedCurrencies: ["USD", "UAH"],
          } as never
        }
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Currency")).toBeInTheDocument();
    expect(
      screen.queryByText("Currency for all economics"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "USD" }));
    expect(screen.getByRole("button", { name: "UAH" })).toBeInTheDocument();
  });

  it("omits the whole economics block when every value is zero or negligible", () => {
    const { container } = render(
      <ChannelEconomicsSummary
        channel={
          {
            id: "channel-1",
            title: "No activity",
            preview: {
              financialSummary: {
                assetEconomics: {
                  currency: "UAH",
                  purchasePrice: 0,
                  adSpend: 0.001,
                  revenue: 0,
                  estimatedAdPrice: null,
                  conversionUnavailable: false,
                },
              },
            },
          } as never
        }
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Spend")).not.toBeInTheDocument();
    expect(screen.queryByText("Not enough data")).not.toBeInTheDocument();
  });

  it("omits zero-value lines from the spend breakdown", async () => {
    render(
      <ChannelEconomicsSummary
        channel={
          {
            id: "channel-1",
            title: "Organic channel",
            preview: {
              financialSummary: {
                assetEconomics: {
                  currency: "UAH",
                  purchasePrice: 0,
                  adSpend: 11_400,
                  revenue: 0,
                  conversionUnavailable: false,
                },
              },
            },
          } as never
        }
      />,
    );

    await userEvent.hover(
      screen.getByRole("button", { name: "Show spend breakdown" }),
    );
    expect(await screen.findByText("Ad spend")).toBeInTheDocument();
    expect(screen.queryByText("Bought for")).not.toBeInTheDocument();
  });
});
