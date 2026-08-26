import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { networkKeys } from "@/lib/query-keys";
import type { TelegramChannelNetwork } from "@/lib/api";
import {
  sortNetworksByEstimatedAdPrice,
  TelegramNetworkCards,
  TelegramPeopleCards,
} from "./telegram-overview-cards";

const { updateNetwork, pushToast } = vi.hoisted(() => ({
  updateNetwork: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelNetworksApi: { update: updateNetwork },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast }),
}));

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({
    onChange,
    ariaLabel,
  }: {
    onChange: (id: string) => void;
    ariaLabel: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onChange("icon-2")}
    >
      🛰️
    </button>
  ),
}));

const network = {
  id: "network-1",
  name: "Creators",
  description: "Creator channels",
  iconId: "icon-1",
  iconPresentation: { type: "unicode", value: "✨" },
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  channels: [
    { id: "channel-1", title: "Main", photoUrl: null },
    { id: "channel-2", title: "Second", photoUrl: null },
  ],
  summary: {
    channelsCount: 2,
    totalSubscribers: 20000,
    pendingJoinRequestsCount: 302,
    activeSubscribersEstimate: 4000,
    paidActiveSubscribersEstimate: 1000,
    viewRate: 20,
    reactionRate: 3.5,
    totalAdSpend: 500,
    campaignsCount: 2,
    totalJoinedSubscribers: 100,
    avgCpa: 5,
    activeCpa: 0.5,
    kpiStatus: "good",
    kpiLabel: "Good",
    assetEconomics: {
      currency: "UAH",
      invested: 700,
      purchasePrice: 200,
      revenue: 350,
      adSpend: 500,
      remainingToBreakEven: 350,
      paybackPercent: 50,
      adsSold: 2,
      estimatedAdPrice: 70,
      estimatedAdsRemaining: 5,
      conversionUnavailable: false,
      formatPricing: {
        currency: "UAH",
        cpm: 300,
        h24: {
          expectedViews: 100,
          estimatedPrice: 30,
          postsSampleCount: 3,
          dataQuality: "READY",
        },
        h48: {
          expectedViews: 150,
          estimatedPrice: 45,
          postsSampleCount: 3,
          dataQuality: "READY",
        },
        h72: {
          expectedViews: 180,
          estimatedPrice: 54,
          postsSampleCount: 3,
          dataQuality: "READY",
        },
        permanent: {
          expectedViews: 200,
          estimatedPrice: 60,
          postsSampleCount: 3,
          dataQuality: "READY",
        },
      },
    },
  },
} satisfies TelegramChannelNetwork;

describe("telegram overview cards", () => {
  beforeEach(() => {
    updateNetwork.mockReset();
    pushToast.mockReset();
  });

  it("sorts networks from the highest estimated ad price to the lowest", () => {
    const expensive = {
      ...network,
      id: "network-expensive",
      name: "Expensive",
      summary: {
        ...network.summary,
        assetEconomics: {
          ...network.summary.assetEconomics,
          estimatedAdPrice: 800,
        },
      },
    };
    const cheap = {
      ...network,
      id: "network-cheap",
      name: "Cheap",
      summary: {
        ...network.summary,
        assetEconomics: {
          ...network.summary.assetEconomics,
          estimatedAdPrice: 120,
        },
      },
    };
    const withoutPrice = {
      ...network,
      id: "network-without-price",
      name: "Without price",
      summary: {
        ...network.summary,
        assetEconomics: {
          ...network.summary.assetEconomics,
          estimatedAdPrice: null,
        },
      },
    };
    const networks = [cheap, withoutPrice, expensive];

    expect(
      sortNetworksByEstimatedAdPrice(networks).map((item) => item.name),
    ).toEqual(["Expensive", "Cheap", "Without price"]);
    expect(networks.map((item) => item.name)).toEqual([
      "Cheap",
      "Without price",
      "Expensive",
    ]);
  });

  it("renders a network as a metric card and selects emoji through the shared picker", async () => {
    updateNetwork.mockResolvedValue({ ...network, iconId: "icon-2" });
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramNetworkCards
          networks={[network]}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Creators" })).toBeInTheDocument();
    expect(screen.getByText("20,000")).toBeInTheDocument();
    expect(screen.getByText("302")).toBeInTheDocument();
    expect(screen.getByLabelText("Pending join requests")).toBeInTheDocument();
    expect(screen.getByLabelText("Audience").parentElement).toBe(
      screen.getByLabelText("Pending join requests").parentElement,
    );
    expect(screen.getByText("302")).toHaveClass("justify-self-end");
    expect(
      screen.getByLabelText("Reaction rate").parentElement,
    ).toHaveTextContent("3.5%");
    expect(screen.queryByText("Good")).not.toBeInTheDocument();
    expect(
      screen.getByText("Spend").parentElement?.querySelector("svg"),
    ).toBeNull();
    for (const label of ["Sub", "Active"]) {
      expect(
        screen.getByText(label).parentElement?.querySelector("svg"),
      ).not.toBeNull();
    }
    expect(screen.getByText("Payback")).toBeInTheDocument();
    expect(screen.getByText("ads to break even")).toBeInTheDocument();
    expect(screen.getByText("No delete")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Choose emoji for Creators" }),
    );
    await waitFor(() =>
      expect(updateNetwork).toHaveBeenCalledWith("network-1", {
        iconId: "icon-2",
      }),
    );
  });

  it("renders All as a protected system network with the Telegram logo", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <TelegramNetworkCards
          networks={[
            {
              ...network,
              id: "system-all",
              name: "All",
              isSystem: true,
              systemKey: "ALL",
              canEdit: false,
              canDelete: false,
              iconId: null,
              iconPresentation: {
                type: "image",
                id: "telegram-system-all-network",
                url: "https://telegram.org/img/t_logo.png",
                name: "Telegram",
              },
            },
          ]}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "All" })).toHaveAttribute(
      "src",
      "https://telegram.org/img/t_logo.png",
    );
    expect(screen.getByRole("img", { name: "All" })).toHaveClass(
      "!rounded-full",
      "!bg-transparent",
    );
    expect(screen.queryByText("Stop")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose emoji for All" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for All" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the authoritative network icon when the update fails", async () => {
    updateNetwork.mockRejectedValue(new Error("offline"));
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    client.setQueryData(networkKeys.list(), [network]);
    render(
      <QueryClientProvider client={client}>
        <TelegramNetworkCards
          networks={[network]}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Choose emoji for Creators" }),
    );

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        "Failed to update network emoji.",
        "error",
      ),
    );
    expect(
      client.getQueryData<TelegramChannelNetwork[]>(networkKeys.list())?.[0]
        ?.iconId,
    ).toBe("icon-1");
  });

  it("renders people with the same card shell and moves delete into the actions menu", () => {
    const person = {
      id: "person-1",
      title: "Matvii",
      username: "matviikpr",
      notes: "Priority contact",
    };
    const onDelete = vi.fn();
    render(<TelegramPeopleCards people={[person]} onDelete={onDelete} />);

    expect(screen.getByText("@matviikpr")).toBeInTheDocument();
    expect(screen.getByText("Priority contact")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Matvii" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete person" }));
    expect(onDelete).toHaveBeenCalledWith(person);
  });
});
