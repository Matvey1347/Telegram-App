import type { ComponentProps } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdSaleModal, defaultAdSaleAccountId } from "./ad-sale-modal";
import { resolveAdSaleCurrency } from "./ad-sale-placement-draft";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

function renderModal(
  overrides: Partial<ComponentProps<typeof AdSaleModal>> = {},
) {
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
    onRequestQuotePreview: vi.fn().mockImplementation((requests) =>
      Promise.resolve({
        items: requests.map(
          (request: { requestId: string; telegramAdProductId?: string }) => ({
            requestId: request.requestId,
            quote: {
              expectedViews:
                request.telegramAdProductId === "format-2" ? 2_500 : 1_250,
              targetCpm: "100",
              recommendedPrice:
                request.telegramAdProductId === "format-2" ? "250" : "125",
              minimumPrice:
                request.telegramAdProductId === "format-2" ? "250" : "125",
              warnings: [],
            },
          }),
        ),
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

function futureScheduledAt() {
  return new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
}

describe("AdSaleModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("offers to continue an unfinished draft and restores its placement settings", async () => {
    const first = renderModal();
    fireEvent.change(screen.getByRole("textbox", { name: "Time for all" }), {
      target: { value: "18:30" },
    });
    await waitFor(() =>
      expect(
        window.localStorage.getItem("telegram-ad-sales:draft:default"),
      ).toContain("18:30"),
    );
    first.unmount();

    renderModal();
    expect(await screen.findByText("Unfinished Ad Sale draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue draft" }));

    expect(screen.getByRole("textbox", { name: "Time for all" })).toHaveValue(
      "18:30",
    );
  });

  it("deletes an unfinished draft when the user chooses to start again", async () => {
    window.localStorage.setItem(
      "telegram-ad-sales:draft:default",
      JSON.stringify({ version: 1, placements: [] }),
    );
    renderModal();

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete draft" }),
    );

    expect(
      window.localStorage.getItem("telegram-ad-sales:draft:default"),
    ).toBeNull();
    expect(screen.getByText("Placement source")).toBeTruthy();
  });

  it("shows the financial account currency and keeps the old draft when starting another sale", async () => {
    window.localStorage.setItem(
      "telegram-ad-sales:draft:default",
      JSON.stringify({
        version: 1,
        accountId: "account-1",
        networkPricingMode: "total",
        networkTotalPrice: "100",
        placements: [
          {
            key: "placement-1",
            channelId: "channel-1",
            productId: "format-usd",
            agreedPrice: "100",
          },
        ],
      }),
    );
    renderModal({
      defaultCurrency: "UAH",
      productsByChannelId: {
        "channel-1": [
          {
            id: "format-usd",
            name: "1/24",
            currency: "USD",
            isActive: true,
            position: 0,
          },
        ] as never,
      },
    });

    expect(await screen.findByText("100 UAH")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create new" }));

    expect(
      window.localStorage.getItem("telegram-ad-sales:draft:default"),
    ).toContain('"networkTotalPrice":"100"');
    expect(screen.getByText("Placement source")).toBeTruthy();
  });

  it("shows only channel avatars in a draft preview with multiple channels", async () => {
    window.localStorage.setItem(
      "telegram-ad-sales:draft:default",
      JSON.stringify({
        version: 1,
        placements: [
          { key: "placement-1", channelId: "channel-1", agreedPrice: "50" },
          { key: "placement-2", channelId: "channel-2", agreedPrice: "50" },
        ],
      }),
    );
    renderModal({
      channels: [
        { id: "channel-1", title: "First channel", photoUrl: null },
        { id: "channel-2", title: "Second channel", photoUrl: null },
      ] as never,
    });

    expect(
      await screen.findByLabelText("2 channels selected"),
    ).toBeInTheDocument();
    expect(screen.queryByText("First channel")).not.toBeInTheDocument();
    expect(screen.queryByText("Second channel")).not.toBeInTheDocument();
  });

  it("defaults to the active financial account assigned to the selected member", () => {
    expect(
      defaultAdSaleAccountId(
        [
          {
            id: "sasha-account",
            assignedMemberId: "member-sasha",
            isActive: true,
          },
          {
            id: "matvii-account",
            assignedMemberId: "member-matvii",
            isActive: true,
          },
        ] as never,
        "member-matvii",
      ),
    ).toBe("matvii-account");
  });

  it("ignores inherited fallback currency when another channel explicitly uses UAH", () => {
    expect(
      resolveAdSaleCurrency({
        channelIds: ["channel-1", "channel-2", "channel-3"],
        channels: [
          { id: "channel-1", adBaseCpm: null, adBaseCurrency: "USD" },
          { id: "channel-2", adBaseCpm: null, adBaseCurrency: "USD" },
          { id: "channel-3", adBaseCpm: 100, adBaseCurrency: "UAH" },
        ],
        placements: [],
        productsByChannelId: {
          "channel-1": [{ currency: "USD" } as never],
          "channel-2": [{ currency: "USD" } as never],
          "channel-3": [{ currency: "USD" } as never],
        },
        fallback: "USD",
      }),
    ).toBe("UAH");
  });

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
    fireEvent.click(adsellOption);
    await screen.findByText(/1\/24 · 125 UAH/);
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

    expect(screen.queryByText("Sale details")).toBeNull();
    expect(screen.queryByText(/Fill contact and payment once/)).toBeNull();
    const member = screen.getByText("Member");
    const detailsRow = member.parentElement?.parentElement;
    expect(detailsRow?.textContent).toContain("Client");
    expect(detailsRow?.textContent).toContain("Financial account");
    expect(detailsRow?.textContent).toContain("Sale origin");
    expect(screen.getByText("Client").parentElement?.textContent).toContain(
      "New client",
    );
    expect(screen.queryByText(/Currency is taken automatically/)).toBeNull();
    expect(screen.queryByText("Network sale price")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Channels" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Example channel" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose network" }));
    const networkOption = await screen.findByRole("button", {
      name: /Improvement/,
    });
    expect(networkOption.textContent).toContain("🧘");
    expect(
      screen.queryByRole("button", { name: "Example channel" }),
    ).toBeNull();
    expect(screen.queryByText(/Expected views:/)).toBeNull();
    expect(screen.queryByText(/Minimum:/)).toBeNull();
    expect(screen.queryByText(/Warning:/)).toBeNull();
  });

  it("submits a managed post draft for a single-channel deal", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderModal({ onSubmit, initialScheduledAt: futureScheduledAt() });
    await screen.findByText(/1\/24 · 125 UAH/);
    expect(
      screen.queryByRole("switch", {
        name: "Use one advertising post for all channels",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create shared post" }));
    fireEvent.change(screen.getByPlaceholderText(/Write your Telegram post/), {
      target: { value: "Single channel creative" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create sale" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].placements[0].managedPostDraft).toEqual(
      expect.objectContaining({ text: "Single channel creative" }),
    );
  });

  it("submits a new client username in canonical Telegram form", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderModal({ onSubmit });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Telegram username" }),
      {
        target: { value: "Buyer_Name" },
      },
    );
    await screen.findByText(/1\/24 · 125 UAH/);
    fireEvent.click(screen.getByRole("button", { name: "Create sale" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        advertiserTelegram: "@buyer_name",
        createAdvertiser: true,
      }),
    );
  });

  it("keeps network channels and placement settings when switching to channel selection", async () => {
    renderModal({ initialChannelId: null });

    fireEvent.click(screen.getByRole("button", { name: "Choose network" }));
    fireEvent.click(await screen.findByRole("button", { name: /Improvement/ }));
    await screen.findByText(/1\/24 · 125 UAH/);

    fireEvent.change(screen.getByRole("textbox", { name: "Time for all" }), {
      target: { value: "18:30" },
    });
    expect(screen.getByText(/· 18:30 · 1\/24/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Channels" }));

    expect(
      screen.getByRole("button", { name: "Example channel" }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Time for all" })).toHaveValue(
      "18:30",
    );
    expect(screen.getByText(/· 18:30 · 1\/24/)).toBeTruthy();
  });

  it("fills the calculated Setup price and refreshes it when the format changes", async () => {
    renderModal();

    await screen.findByText(/1\/24 · 125 UAH/);

    fireEvent.change(screen.getByRole("textbox", { name: "Time for all" }), {
      target: { value: "18:30" },
    });
    expect(screen.getByText(/· 18:30 · 1\/24/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Format for all" }));
    fireEvent.click(await screen.findByRole("button", { name: "2/48" }));

    await screen.findByText(/2\/48 · 250 UAH/);
  });

  it("creates placement rows for every selected date without a separate bulk mode", async () => {
    renderModal({ initialScheduledAt: "2099-08-10T12:00:00.000Z" });

    fireEvent.change(screen.getByRole("textbox", { name: "Time for all" }), {
      target: { value: "18:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Format for all" }));
    fireEvent.click(await screen.findByRole("button", { name: "2/48" }));

    fireEvent.click(screen.getAllByRole("button", { name: "10.08.2099" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "11" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "12" })[0]);

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /Actions for Example channel/ }),
      ).toHaveLength(2),
    );
    expect(screen.getByText("Network sale price")).toBeTruthy();
    expect(screen.getAllByText(/· 18:30 · 2\/48/)).toHaveLength(2);
    expect(screen.getByText(/expected value \(views × CPM\)/i)).toBeTruthy();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Example channel" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Find nearby date" }));
    const pastDate = await screen.findByText("Past date");
    const availableDate = await screen.findByText("Available");
    expect(pastDate.closest("button")?.className).toContain("rose");
    expect(availableDate.closest("button")?.className).toContain("emerald");

    fireEvent.click(availableDate.closest("button")!);
    expect(screen.getByText(/2099-01-01 · 12:00/)).toBeTruthy();
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
      initialScheduledAt: futureScheduledAt(),
      onLoadPublishedPosts,
    });

    expect(
      await screen.findByRole("button", {
        name: "Actions for Example channel",
      }),
    ).toBeTruthy();
    expect(onLoadPublishedPosts).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Example channel" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Configurate post" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Select a published post" }),
    );
    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);

    const postOption = await screen.findByRole("button", {
      name: /17:00 · Published campaign post/,
    });
    fireEvent.click(postOption);

    expect(screen.getByText(/· 17:00 ·/)).toBeTruthy();
  });

  it("shows the published-post selector immediately for a past placement", async () => {
    const onLoadPublishedPosts = vi.fn().mockResolvedValue([]);
    renderModal({
      initialScheduledAt: "2020-08-25T12:00:00.000Z",
      onLoadPublishedPosts,
    });

    const postSelector = await screen.findByRole("button", {
      name: "Select a published post",
    });
    expect(
      screen.queryByRole("button", { name: "Configurate post" }),
    ).toBeNull();

    fireEvent.click(postSelector);
    await waitFor(() => expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1));
    expect(onLoadPublishedPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel-1",
        date: "2020-08-25",
      }),
    );
  });

  it("keeps the post selector available and retries after a loading failure", async () => {
    const onLoadPublishedPosts = vi
      .fn()
      .mockRejectedValue(new Error("Telegram unavailable"));
    renderModal({
      initialScheduledAt: futureScheduledAt(),
      onLoadPublishedPosts,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Example channel" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Configurate post" }));
    await screen.findByRole("button", { name: "Select a published post" });
    fireEvent.click(
      screen.getByRole("button", { name: "Select a published post" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Loading posts...")).toBeNull(),
    );

    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Select a published post" })[0],
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select a published post" }),
    );
    await waitFor(() => expect(onLoadPublishedPosts).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Advertising post").length).toBeGreaterThan(0);
  });

  it("splits one sold total by expected value and reuses one post across the network", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const onRequestQuotePreview = vi.fn().mockImplementation((requests) =>
      Promise.resolve({
        items: requests.map(
          (request: { requestId: string; telegramChannelId: string }) => ({
            requestId: request.requestId,
            quote: {
              expectedViews:
                request.telegramChannelId === "channel-2" ? 2_000 : 1_000,
              targetCpm:
                request.telegramChannelId === "channel-2" ? "200" : "100",
              recommendedPrice:
                request.telegramChannelId === "channel-2" ? "400" : "100",
              minimumPrice: "0",
              warnings: [],
            },
          }),
        ),
      }),
    );
    const product = {
      id: "format-1",
      name: "No auto-delete",
      currency: "UAH",
      defaultPricingMode: "FIXED",
      defaultCpm: null,
      defaultFixedPrice: "100",
      minimumPrice: "0",
      estimatedViews: 1_000,
      estimatedPrice: "100",
      isActive: true,
      position: 0,
    };
    renderModal({
      initialChannelId: null,
      initialScheduledAt: futureScheduledAt(),
      defaultCurrency: "USD",
      accounts: [
        {
          id: "account-1",
          name: "USD account",
          currency: "USD",
          isActive: true,
        },
      ] as never,
      channels: [
        {
          id: "channel-1",
          title: "Small",
          currentSubscribersCount: 30_000,
          adBaseCpm: 100,
          adBaseCurrency: "UAH",
        },
        {
          id: "channel-2",
          title: "Large",
          currentSubscribersCount: 70_000,
          adBaseCpm: 100,
          adBaseCurrency: "UAH",
        },
      ] as never,
      networks: [
        {
          id: "network-1",
          name: "All channels",
          channels: [{ id: "channel-1" }, { id: "channel-2" }],
        },
      ] as never,
      productsByChannelId: {
        "channel-1": [product],
        "channel-2": [{ ...product, id: "format-2" }],
      } as never,
      onRequestQuotePreview,
      onSubmit,
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose network" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /All channels/ }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /Actions for/ }),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(onRequestQuotePreview).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ currency: "USD" })]),
        expect.any(AbortSignal),
      ),
    );
    expect(onRequestQuotePreview).toHaveBeenCalledTimes(1);
    expect(onRequestQuotePreview.mock.calls[0][0]).toHaveLength(2);
    const soldTotal = screen
      .getByText("Sold total")
      .parentElement?.querySelector("input");
    expect(soldTotal).toBeTruthy();
    fireEvent.change(soldTotal!, { target: { value: "735" } });
    fireEvent.click(screen.getByRole("button", { name: "Create shared post" }));
    const [title] = await screen.findAllByDisplayValue("Advertising post");
    fireEvent.change(title, { target: { value: "Campaign creative" } });
    fireEvent.change(screen.getByPlaceholderText(/Write your Telegram post/), {
      target: { value: "Campaign text" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Actions for/ })[0]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit channel post" }),
    );
    expect(
      screen.queryByRole("button", { name: "Select a published post" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create sale" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.priceAllocation).toEqual({
      mode: "PROPORTIONAL_BY_AUDIENCE",
      totalAmount: 735,
    });
    expect(
      payload.placements.map(
        (placement: { agreedPrice: number }) => placement.agreedPrice,
      ),
    ).toEqual([147, 588]);
    expect(
      payload.placements.every(
        (placement: { managedPostDraft?: { title: string } }) =>
          placement.managedPostDraft?.title === "Campaign creative",
      ),
    ).toBe(true);
    expect(payload.paymentAmount).toBe(735);
    expect(payload.paymentCurrency).toBe("USD");
  });
});
