import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AdSaleModal } from "./ad-sale-modal";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

function renderModal(overrides: Partial<ComponentProps<typeof AdSaleModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props: ComponentProps<typeof AdSaleModal> = {
    open: true,
    onClose: vi.fn(),
    accounts: [
      {
        id: "account-1",
        name: "Operating account",
        currency: "UAH",
        isActive: true,
      },
    ] as never,
    channels: [
      {
        id: "channel-1",
        title: "Example channel",
        photoUrl: "https://example.test/channel.png",
      },
    ] as never,
    networks: [
      {
        id: "network-1",
        name: "Improvement",
        iconPresentation: { type: "unicode", value: "🧘" },
        channels: [{ id: "channel-1" }],
      },
    ] as never,
    productsByChannelId: {
      "channel-1": [
        {
          id: "format-1",
          name: "1/24",
          currency: "UAH",
          defaultPricingMode: "CPM",
          defaultCpm: "100",
          defaultFixedPrice: null,
          minimumPrice: "125",
          estimatedViews: 1_250,
          estimatedPrice: "125",
          isActive: true,
          position: 0,
        },
        {
          id: "format-2",
          name: "2/48",
          currency: "UAH",
          defaultPricingMode: "CPM",
          defaultCpm: "100",
          defaultFixedPrice: null,
          minimumPrice: "250",
          estimatedViews: 2_500,
          estimatedPrice: "250",
          isActive: true,
          position: 1,
        },
      ] as never,
    },
    defaultCurrency: "UAH",
    workspaceTimezone: "Europe/Warsaw",
    initialChannelId: "channel-1",
    onLoadAvailableSlots: vi.fn().mockResolvedValue([]),
    onLoadPublishedPosts: vi.fn().mockResolvedValue([]),
    onRequestQuote: vi.fn().mockImplementation(({ productId }) =>
      Promise.resolve({
        expectedViews: productId === "format-2" ? 2_500 : 1_250,
        targetCpm: "100",
        recommendedPrice: productId === "format-2" ? "250" : "125",
        minimumPrice: productId === "format-2" ? "250" : "125",
        warnings: [],
      }),
    ),
    onSearchAdvertisers: vi.fn().mockResolvedValue([]),
    onSubmit: vi.fn().mockResolvedValue({}),
    ...overrides,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AdSaleModal {...props} />
    </QueryClientProvider>,
  );
}

describe("AdSaleModal", () => {
  it("submits the selected sale origin", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderModal({ onSubmit });

    expect(screen.getByRole("button", { name: /New sales/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New sales/ }));
    const repeatOption = await screen.findByRole("button", {
      name: /Repeat sales/,
    });
    expect(repeatOption.textContent).toContain("🔁");
    const collaboratorOption = screen.getByRole("button", {
      name: "Collaborator.pro",
    });
    expect(collaboratorOption.querySelector("img")?.getAttribute("src")).toBe(
      "https://collaborator.pro/favicon-collaborator.ico",
    );
    const adsellOption = screen.getByRole("button", { name: "adsell.io" });
    expect(adsellOption.querySelector("img")?.getAttribute("src")).toBe(
      "https://adsell.io/assets/img/favicon.png",
    );
    fireEvent.click(
      adsellOption,
    );
    await screen.findByText("Recommended: 125 UAH");
    fireEvent.click(screen.getByRole("button", { name: "Create sale" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: "ADSELL_IO",
          advertiserId: null,
          advertiserName: "Direct sale",
          createAdvertiser: false,
        }),
      ),
    );
  });

  it("groups optional contact details and shows the network emoji", async () => {
    renderModal();

    const responsibleMember = screen.getByText("Responsible member");
    const detailsRow = responsibleMember.parentElement?.parentElement;
    expect(detailsRow?.textContent).toContain("Contact");
    expect(detailsRow?.textContent).toContain("Financial account");
    expect(detailsRow?.textContent).toContain("Sale origin");
    expect(screen.getByText("Contact").parentElement?.textContent).toBe("Contact");
    expect(screen.queryByText(/Currency is taken automatically/)).toBeNull();
    expect(screen.getByRole("button", { name: "Channels" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Example channel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose network" }));
    const networkOption = await screen.findByRole("button", { name: /Improvement/ });
    expect(networkOption.textContent).toContain("🧘");
    expect(screen.queryByRole("button", { name: "Example channel" })).toBeNull();
    expect(screen.queryByText(/Expected views:/)).toBeNull();
    expect(screen.queryByText(/Minimum:/)).toBeNull();
    expect(screen.queryByText(/Warning:/)).toBeNull();
  });

  it("fills the calculated Setup price and refreshes it when the format changes", async () => {
    renderModal();

    const firstRecommendation = await screen.findByText("Recommended: 125 UAH");
    expect(firstRecommendation.parentElement?.querySelector("input")?.value).toBe("125");

    fireEvent.click(screen.getByRole("button", { name: "1/24" }));
    fireEvent.click(await screen.findByRole("button", { name: "2/48" }));

    const secondRecommendation = await screen.findByText("Recommended: 250 UAH");
    expect(secondRecommendation.parentElement?.querySelector("input")?.value).toBe("250");
  });

  it("creates placement rows for every selected date without a separate bulk mode", async () => {
    renderModal({ initialScheduledAt: "2026-08-10T12:00:00.000Z" });

    fireEvent.click(screen.getAllByRole("button", { name: "10.08.2026" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "11" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "12" })[0]);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Configure post" })).toHaveLength(2),
    );
    expect(screen.queryByRole("button", { name: /Bulk sales/ })).toBeNull();
  });

  it("uses nearby only for the date and marks past and available dates", async () => {
    renderModal({
      onLoadAvailableSlots: vi.fn().mockResolvedValue([
        {
          channelId: "channel-1",
          date: "2000-01-01",
          scheduledAt: "2000-01-01T08:00:00.000Z",
          timezone: "Europe/Warsaw",
          state: "PAST",
        },
        {
          channelId: "channel-1",
          date: "2099-01-01",
          scheduledAt: "2099-01-01T18:00:00.000Z",
          timezone: "Europe/Warsaw",
          state: "AVAILABLE",
        },
      ] as never),
    });

    fireEvent.click(screen.getByText("Find nearby date"));
    const pastDate = await screen.findByText("Past date");
    const availableDate = await screen.findByText("Available");
    expect(pastDate.closest("button")?.className).toContain("rose");
    expect(availableDate.closest("button")?.className).toContain("emerald");

    fireEvent.click(availableDate.closest("button")!);
    expect(screen.getByDisplayValue("2099-01-01")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();
  });

  it("loads published posts on open and uses the selected post time", async () => {
    const onLoadPublishedPosts = vi.fn().mockResolvedValue([
      {
        id: "post-1",
        title: "Published campaign post",
        publishedAt: "2026-08-02T17:00:00+02:00",
      },
    ]);
    renderModal({
      onLoadPublishedPosts,
    });

    expect((await screen.findAllByText("Advertising post")).length).toBeGreaterThan(0);
    expect(onLoadPublishedPosts).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Configure post" }));
    fireEvent.click(screen.getByRole("button", { name: "Load published posts" }));
    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);

    const postOption = await screen.findByRole("button", {
      name: /17:00 · Published campaign post/,
    });
    fireEvent.click(postOption);

    expect(screen.getByDisplayValue("17:00")).toBeTruthy();
  });

  it("keeps the post selector available and retries after a loading failure", async () => {
    const onLoadPublishedPosts = vi.fn().mockRejectedValue(new Error("Telegram unavailable"));
    renderModal({ onLoadPublishedPosts });

    fireEvent.click(screen.getByRole("button", { name: "Configure post" }));
    await screen.findByRole("button", { name: "Select a published post" });
    fireEvent.click(screen.getByRole("button", { name: "Load published posts" }));
    await waitFor(() => expect(screen.queryByText("Loading posts...")).toBeNull());

    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Load published posts" }));
    await waitFor(() => expect(onLoadPublishedPosts).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Advertising post").length).toBeGreaterThan(0);
  });
});
