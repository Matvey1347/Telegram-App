import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTelegramInviteLinkOptions } from "./use-telegram-invite-link-options";

const mocks = vi.hoisted(() => ({
  getInitial: vi.fn(),
  getAll: vi.fn(),
  getForSelect: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getTelegramChannelInitialInviteLink: mocks.getInitial,
  getAllTelegramChannelInviteLinks: mocks.getAll,
  getTelegramChannelInviteLinksForSelect: mocks.getForSelect,
}));

describe("useTelegramInviteLinkOptions", () => {
  it("keeps the initial default link and searches only after two characters", async () => {
    mocks.getInitial.mockResolvedValue([
      {
        id: "default-link",
        telegramChannelId: "channel-1",
        name: "Default link",
        url: "https://t.me/+default",
        isDefaultForChannel: true,
      },
    ]);
    mocks.getAll.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ search }) =>
        useTelegramInviteLinkOptions({
          channelId: "channel-1",
          search,
          searchMinimumLength: 2,
        }),
      { initialProps: { search: "" }, wrapper },
    );

    await waitFor(() => expect(result.current.initialLink?.id).toBe("default-link"));
    expect(mocks.getAll).not.toHaveBeenCalled();

    await act(async () => rerender({ search: "a" }));
    expect(mocks.getAll).not.toHaveBeenCalled();

    await act(async () => rerender({ search: "ab" }));
    await waitFor(() =>
      expect(mocks.getAll).toHaveBeenCalledWith("channel-1", {
        search: "ab",
      }),
    );
  });
});
