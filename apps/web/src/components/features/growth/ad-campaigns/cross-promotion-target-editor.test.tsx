import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionTargetEditor } from "./cross-promotion-target-editor";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  onRegistered: undefined as
    | ((link: { id: string; name: string; url: string }, url: string) => void)
    | undefined,
}));

vi.mock("@/lib/features/telegram/use-telegram-invite-link-options", () => ({
  useTelegramInviteLinkOptions: () => ({
    links: [],
    initialLink: null,
    requestAll: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/lib/features/telegram/use-register-telegram-invite-link", () => ({
  useRegisterTelegramInviteLink: (options: {
    onRegistered: (link: { id: string; name: string; url: string }, url: string) => void;
  }) => {
    mocks.onRegistered = options.onRegistered;
    return {
      mutateAsync: mocks.register,
      isError: false,
    };
  },
}));

describe("CrossPromotionTargetEditor", () => {
  it("offers invite-link verification directly inside the select", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.register.mockImplementation(async (url: string) => {
      mocks.onRegistered?.(
        {
          id: "verified-link",
          name: "Telegram campaign title",
          url,
        },
        url,
      );
    });
    const onResolved = vi.fn();

    render(
      <QueryClientProvider client={client}>
        <CrossPromotionTargetEditor
          channel={{ id: "channel-1", title: "Channel" } as never}
          value={{ telegramChannelId: "channel-1", inviteLinkId: "" }}
          onChange={vi.fn()}
          onResolved={onResolved}
          showPromo={false}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Select invite link" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search invite links"),
      "https://t.me/+trackingLink",
    );
    await user.click(
      screen.getByRole("button", { name: "Verify and add this invite link" }),
    );

    expect(mocks.register).toHaveBeenCalledWith("https://t.me/+trackingLink");
    expect(onResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteLink: expect.objectContaining({
          name: "Telegram campaign title",
        }),
      }),
    );
  });
});
