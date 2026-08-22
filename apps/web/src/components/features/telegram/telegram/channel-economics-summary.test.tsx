import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChannelEconomicsSummary } from "./channel-economics-summary";

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
  it("shows ledger totals and format prices derived from recent reach windows", () => {
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
              audience: { subscribersCount: 7_719, viewRate: 7.3 },
              financialSummary: {
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

    expect(screen.getByText("25,000 UAH")).toBeInTheDocument();
    expect(screen.getByText("4,500 UAH")).toBeInTheDocument();
    expect(screen.getByText("8,000 UAH")).toBeInTheDocument();
    expect(screen.queryByText("1,695 UAH")).not.toBeInTheDocument();
    expect(screen.getByText("1/24")).toBeInTheDocument();
    expect(screen.getByText("124 views")).toBeInTheDocument();
    expect(screen.getByText("37.2 UAH")).toBeInTheDocument();
    expect(screen.getByText("No delete")).toBeInTheDocument();
    expect(screen.getByText("244 views")).toBeInTheDocument();
    expect(screen.getByText("73.2 UAH")).toBeInTheDocument();
  });

  it("uses the unclipped portal select with the concise Currency label", async () => {
    render(
      <ChannelEconomicsSummary
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
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /edit economics/i }),
    );
    expect(screen.getByText("Currency")).toBeInTheDocument();
    expect(
      screen.queryByText("Currency for all economics"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "USD" }));
    expect(screen.getByRole("button", { name: "UAH" })).toBeInTheDocument();
  });

  it("renders missing or zero income and expenses as dashes", () => {
    render(
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
                  adSpend: 0,
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

    expect(screen.queryByText("0 UAH")).not.toBeInTheDocument();
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
    for (const label of ["Bought for", "Ad spend", "Earned"]) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent("—");
    }
    expect(screen.getAllByText("Not enough data")).toHaveLength(4);
  });
});
