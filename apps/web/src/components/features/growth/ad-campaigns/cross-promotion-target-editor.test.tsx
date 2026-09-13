import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionTargetEditor } from "./cross-promotion-target-editor";

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/lib/features/telegram/use-telegram-invite-link-options", () => ({
  useTelegramInviteLinkOptions: () => ({
    links: [],
    initialLink: null,
    requestAll: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/lib/features/telegram/use-register-telegram-invite-link", () => ({
  useRegisterTelegramInviteLink: () => ({
    mutateAsync: mocks.register,
    isError: false,
  }),
}));

describe("CrossPromotionTargetEditor", () => {
  it("offers invite-link verification directly inside the select", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.register.mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={client}>
        <CrossPromotionTargetEditor
          channel={{ id: "channel-1", title: "Channel" } as never}
          value={{ telegramChannelId: "channel-1", inviteLinkId: "" }}
          onChange={vi.fn()}
          showPromo={false}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Select invite link" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search…"),
      "https://t.me/+trackingLink",
    );
    await user.click(
      screen.getByRole("button", { name: "Verify and add this invite link" }),
    );

    expect(mocks.register).toHaveBeenCalledWith("https://t.me/+trackingLink");
  });
});
