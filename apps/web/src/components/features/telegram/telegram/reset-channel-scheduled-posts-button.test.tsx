import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramPostKeys } from "@/lib/query-keys";
import { ResetChannelScheduledPostsButton } from "./reset-channel-scheduled-posts-button";

const { resetScheduled, pushToast } = vi.hoisted(() => ({
  resetScheduled: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    resetChannelScheduledPostsToDrafts: resetScheduled,
  },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast }),
}));

describe("ResetChannelScheduledPostsButton", () => {
  beforeEach(() => {
    resetScheduled.mockReset();
    pushToast.mockReset();
  });

  it("requires confirmation before resetting the selected channel", async () => {
    resetScheduled.mockResolvedValue({
      action: "RESET_CHANNEL_SCHEDULED_TO_DRAFT",
      channelId: "channel-1",
      remoteScheduledDeletedCount: 3,
      postsReturnedToDraftCount: 2,
      postIds: ["post-1", "post-2"],
    });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onCompleted = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ResetChannelScheduledPostsButton
          channelId="channel-1"
          channelTitle="Mentor"
          onCompleted={onCompleted}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Return all to drafts" }),
    );
    expect(resetScheduled).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Mentor"), {
      target: { value: "Mentor" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Return all to drafts",
      }),
    );

    await waitFor(() =>
      expect(resetScheduled).toHaveBeenCalledWith("channel-1"),
    );
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostKeys.managedLists("channel-1"),
    });
    expect(pushToast).toHaveBeenCalledWith(
      "Deleted 3 scheduled Telegram messages and returned 2 posts to drafts.",
      "success",
      7000,
    );
  });

  it("keeps the confirmation recoverable when Telegram rejects the reset", async () => {
    resetScheduled.mockRejectedValue(new Error("Telegram account is blocked"));
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ResetChannelScheduledPostsButton
          channelId="channel-1"
          channelTitle="Mentor"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Return all to drafts" }),
    );
    fireEvent.change(screen.getByPlaceholderText("Mentor"), {
      target: { value: "Mentor" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Return all to drafts",
      }),
    );

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        "Telegram account is blocked",
        "error",
        7000,
      ),
    );
    expect(
      screen.getByRole("button", { name: "Return all to drafts" }),
    ).toBeEnabled();
  });
});
