import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TelegramMessageTemplateInviteLinkSelect } from "./telegram-message-template-invite-link-select";

const register = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramChannelsApi: {
      ...actual.telegramChannelsApi,
      registerInviteLink: (...args: unknown[]) => register(...args),
    },
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    startOperation: () => ({ succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

function SelectHarness() {
  const [value, setValue] = useState("");
  return (
    <TelegramMessageTemplateInviteLinkSelect
      channelId="channel-1"
      links={[]}
      value={value}
      onChange={setValue}
    />
  );
}

describe("TelegramMessageTemplateInviteLinkSelect", () => {
  it("verifies a typed link for the channel and selects the registered ID", async () => {
    register.mockResolvedValue({ id: "registered-link" });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SelectHarness />
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Select invite link" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText(/Search/),
      "https://t.me/+Verified_1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Verify and add this invite link" }),
    );
    expect(register).toHaveBeenCalledWith(
      "channel-1",
      "https://t.me/+Verified_1",
    );
    expect(
      await screen.findByRole("button", { name: /Imported invite link/ }),
    ).toBeVisible();
  });
});
