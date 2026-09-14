import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromoFormModal } from "./promo-form-modal";

const mocks = vi.hoisted(() => ({
  getInitialInviteLink: vi.fn(),
  getAllInviteLinks: vi.fn(),
  createEmoji: vi.fn(),
  preparePromoPostImport: vi.fn(),
  promoPostImportResult: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getTelegramChannelInitialInviteLink: mocks.getInitialInviteLink,
    getAllTelegramChannelInviteLinks: mocks.getAllInviteLinks,
    iconsApi: { ...actual.iconsApi, createEmoji: mocks.createEmoji },
    telegramSystemBotApi: {
      connection: vi
        .fn()
        .mockResolvedValue({ connected: true, botUsername: null }),
      preparePromoPostImport: mocks.preparePromoPostImport,
      promoPostImportResult: mocks.promoPostImportResult,
    },
  };
});
vi.mock("@/components/features/workspace/member-select", () => ({
  MemberSelect: () => <button type="button">Select member</button>,
}));
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ iconId }: { iconId?: string | null }) => (
    <button type="button" data-testid="promo-emoji-picker">
      {iconId || "Add emoji"}
    </button>
  ),
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: () => <div>Telegram preview</div>,
  }),
);
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-media-upload",
  () => ({
    TelegramPostMediaUpload: () => <div>Media upload</div>,
  }),
);
vi.mock("@/components/features/telegram/telegram/telegram-text-editor", () => ({
  TelegramTextEditor: () => (
    <div data-testid="telegram-text-editor">Standard Telegram editor</div>
  ),
}));

describe("PromoFormModal", () => {
  beforeEach(() => {
    mocks.getInitialInviteLink.mockReset().mockResolvedValue([]);
    mocks.getAllInviteLinks.mockReset().mockResolvedValue([]);
    mocks.createEmoji
      .mockReset()
      .mockResolvedValue({ id: "emoji-icon", type: "emoji", emoji: "🧠" });
    mocks.preparePromoPostImport.mockReset().mockResolvedValue({
      workflowId: "workflow-1",
    });
    mocks.promoPostImportResult.mockReset().mockResolvedValue({
      ready: true,
      draft: {
        title: "🔷 Imported promo",
        text: "Headline 🔷 then body",
        imageUrls: [],
        buttonRows: [],
      },
    });
  });

  it("shows every promo field immediately while keeping the post editor collapsed", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PromoFormModal
          open
          title="Create Promo"
          channels={[{ id: "channel-1", title: "Channel" } as never]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Internal title")).toBeVisible();
    expect(screen.getByText("Channel")).toBeVisible();
    expect(screen.getByText("Member")).toBeVisible();
    expect(screen.getByText("Invite link")).toBeVisible();
    expect(
      screen.queryByTestId("telegram-text-editor"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Edit manually/ }),
    );

    expect(screen.getByTestId("telegram-text-editor")).toBeInTheDocument();
    expect(screen.queryByText("Add Telegram buttons")).not.toBeInTheDocument();
  });

  it("loads the default link only after a channel is selected, then loads all links on open", async () => {
    let resolveAll!: (value: unknown[]) => void;
    mocks.getInitialInviteLink.mockResolvedValue([
      {
        id: "default-link",
        telegramChannelId: "channel-1",
        name: "Main link",
        url: "https://t.me/+main",
        joinedCount: 0,
        requestedCount: 0,
        isRevoked: false,
        isDefaultForChannel: true,
      },
    ]);
    mocks.getAllInviteLinks.mockReturnValue(
      new Promise((resolve) => {
        resolveAll = resolve;
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PromoFormModal
          open
          title="Create Promo"
          channels={[{ id: "channel-1", title: "Channel" } as never]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(mocks.getInitialInviteLink).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("telegram-text-editor"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Invite link")).toBeVisible();
    expect(screen.queryByText("Default invite link")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Select channel" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "C Channel" }));
    await screen.findByRole("button", { name: /Main link/ });
    expect(mocks.getInitialInviteLink).toHaveBeenCalledWith(
      "channel-1",
      undefined,
    );
    expect(mocks.getAllInviteLinks).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Main link/ }));
    expect(await screen.findByText("Loading invite links…")).toBeVisible();
    expect(mocks.getAllInviteLinks).toHaveBeenCalledOnce();
    resolveAll([
      {
        id: "other-link",
        telegramChannelId: "channel-1",
        name: "Other link",
        url: "https://t.me/+other",
        joinedCount: 0,
        requestedCount: 0,
        isRevoked: false,
      },
    ]);
    await waitFor(() => expect(screen.getByText("Other link")).toBeVisible());
    expect(screen.queryByText("Replace invite links")).not.toBeInTheDocument();
  });

  it("prefills the promo icon from the first emoji in the post", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PromoFormModal
          open
          title="Edit Promo"
          initial={
            {
              id: "promo-1",
              title: "Promo",
              telegramChannelId: "channel-1",
              text: "Heading without icon\nFirst 🧠 and later 🔥",
            } as never
          }
          channels={[{ id: "channel-1", title: "Channel" } as never]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(mocks.createEmoji).toHaveBeenCalledWith({
        emoji: "🧠",
        name: expect.any(String),
      }),
    );
  });

  it("puts the first emoji into the picker when a post is imported from the bot", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <PromoFormModal
          open
          title="Create Promo"
          channels={[{ id: "channel-1", title: "Channel" } as never]}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const forwardButton = await screen.findByRole("button", {
      name: /Import from bot/,
    });
    await waitFor(() => expect(forwardButton).toBeEnabled());
    await userEvent.click(forwardButton);
    expect(
      screen.getByText(/Waiting for your forwarded post/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.createEmoji).toHaveBeenCalledWith({
        emoji: "🔷",
        name: expect.any(String),
      }),
    );
    expect(await screen.findByTestId("promo-emoji-picker")).toHaveTextContent(
      "emoji-icon",
    );
    expect(screen.getByTestId("telegram-text-editor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Imported promo")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("🔷 Imported promo"),
    ).not.toBeInTheDocument();
  });
});
