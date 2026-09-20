import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromoCard } from "./promo-card";

const mocks = vi.hoisted(() => ({
  getPromo: vi.fn(),
  getInitialInviteLinks: vi.fn(),
  getAllInviteLinks: vi.fn(),
  sendPostPreview: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    promosApi: { ...actual.promosApi, get: mocks.getPromo },
    getTelegramChannelInitialInviteLink: mocks.getInitialInviteLinks,
    getAllTelegramChannelInviteLinks: mocks.getAllInviteLinks,
    telegramSystemBotApi: {
      ...actual.telegramSystemBotApi,
      connection: vi.fn().mockResolvedValue({
        connected: true,
        currentWorkspaceId: "workspace-1",
        botUsername: null,
      }),
      sendPostPreview: mocks.sendPostPreview,
    },
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    startOperation: () => ({ succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

const promo = {
  id: "promo-1",
  telegramChannelId: "channel-1",
  iconPresentation: { type: "unicode", value: "✨" },
  title: "Крео 1",
  previewText:
    "Начало рекламного текста, которое должно быть видно в карточке.",
  previewImageUrl: "https://cdn.test/promo.jpg",
  status: "active",
} as const;

describe("PromoCard", () => {
  it("shows the creative opening and keeps edit and delete in the overflow menu", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <PromoCard promo={promo} onEdit={onEdit} onDelete={onDelete} />,
    );

    expect(screen.getByText(/Начало рекламного текста/)).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/promo.jpg",
    );
    expect(container.querySelector("img")).toHaveClass("h-auto", "w-full");
    expect(container.querySelector("img")).not.toHaveClass("object-cover");
    expect(container.querySelector("img")?.parentElement).not.toHaveClass(
      "aspect-[16/9]",
    );
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit promo Крео 1" }),
    );
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renders Telegram bold markup without visible delimiters", () => {
    render(
      <PromoCard
        promo={{ ...promo, previewText: "**Bold opening**" }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Bold opening").tagName).toBe("B");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("sends a copy with a new invite link without saving the promo", async () => {
    const oldLink = {
      id: "old-link",
      telegramChannelId: "channel-1",
      url: "https://t.me/+old",
      name: "Old link",
      joinedCount: 0,
      requestedCount: 0,
      isRevoked: false,
    };
    const newLink = {
      ...oldLink,
      id: "new-link",
      url: "https://t.me/+new",
      name: "New link",
    };
    mocks.getInitialInviteLinks.mockResolvedValue([oldLink]);
    mocks.getAllInviteLinks.mockResolvedValue([oldLink, newLink]);
    mocks.sendPostPreview.mockResolvedValue({ status: "SENT" });
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    mocks.getPromo.mockResolvedValue({
      ...promo,
      text: "Join https://t.me/+old",
      buttonRows: [
        [{ text: "Join", url: "https://t.me/+old", style: "primary" }],
      ],
      defaultInviteLinkId: oldLink.id,
      defaultInviteLink: oldLink,
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PromoCard promo={promo} onEdit={onEdit} onDelete={onDelete} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Send to bot" }),
    );
    expect(await screen.findByText("✨")).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /Old link/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /New link/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send to bot" }));

    await waitFor(() =>
      expect(mocks.sendPostPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Join https://t.me/+new",
          buttonRows: [
            [{ text: "Join", url: "https://t.me/+new", style: "primary" }],
          ],
        }),
      ),
    );
    expect(mocks.getPromo).toHaveBeenCalledWith("promo-1");
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("waits for the saved invite link before showing a selection or send preview", async () => {
    const savedLink = {
      id: "saved-link",
      telegramChannelId: "channel-1",
      url: "https://t.me/+saved",
      name: "Saved link",
      joinedCount: 0,
      requestedCount: 0,
      isRevoked: false,
    };
    const otherLink = {
      ...savedLink,
      id: "other-link",
      name: "Other link",
      url: "https://t.me/+other",
      isDefaultForChannel: true,
    };
    let finishLinks!: (links: (typeof savedLink)[]) => void;
    mocks.getInitialInviteLinks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLinks = resolve;
        }),
    );
    mocks.getPromo.mockResolvedValue({
      ...promo,
      text: "Join https://t.me/+saved",
      defaultInviteLinkId: savedLink.id,
      defaultInviteLink: savedLink,
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PromoCard promo={promo} onEdit={vi.fn()} onDelete={vi.fn()} />
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Send to bot" }),
    );
    expect(
      await screen.findByRole("button", { name: "Loading invite link…" }),
    ).toBeDisabled();
    expect(
      screen.queryByText(/The bot will receive this link/),
    ).not.toBeInTheDocument();
    finishLinks([otherLink, savedLink]);
    expect(
      await screen.findByRole("button", { name: /Saved link/ }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Other link/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("The bot will receive this link:")).toBeVisible();
    expect(
      within(
        screen.getByText("The bot will receive this link:").parentElement!,
      ).getByText("https://t.me/+saved"),
    ).toBeVisible();
  });

  it("does not send when the full promo cannot be loaded", async () => {
    mocks.getPromo.mockRejectedValue(new Error("network unavailable"));
    mocks.sendPostPreview.mockClear();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PromoCard promo={promo} onEdit={vi.fn()} onDelete={vi.fn()} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Send to bot" }),
    );
    expect(
      await screen.findByText("Could not load the promo post."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to bot" })).toBeDisabled();
    expect(mocks.sendPostPreview).not.toHaveBeenCalled();
  });
});
