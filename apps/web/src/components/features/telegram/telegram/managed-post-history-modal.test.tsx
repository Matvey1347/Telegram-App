import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedPostHistoryModal } from "./managed-post-history-modal";

const { managedPostHistory } = vi.hoisted(() => ({
  managedPostHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { managedPostHistory },
}));

describe("ManagedPostHistoryModal", () => {
  beforeEach(() => {
    managedPostHistory.mockReset().mockResolvedValue([]);
  });

  it("loads history only after the modal is opened", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const props = {
      channelId: "channel-1",
      postId: "post-1",
      restorePending: false,
      onClose: vi.fn(),
      onRestore: vi.fn(),
    };
    const view = render(
      <QueryClientProvider client={client}>
        <ManagedPostHistoryModal {...props} open={false} />
      </QueryClientProvider>,
    );

    expect(managedPostHistory).not.toHaveBeenCalled();

    view.rerender(
      <QueryClientProvider client={client}>
        <ManagedPostHistoryModal {...props} open />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(managedPostHistory).toHaveBeenCalledTimes(1));
    expect(managedPostHistory).toHaveBeenCalledWith("channel-1", "post-1");
  });

  it("shows the member avatar and action that produced a history entry", async () => {
    managedPostHistory.mockResolvedValue([
      {
        id: "revision-1",
        reason: "before_update",
        createdAt: "2026-09-04T10:00:00.000Z",
        actorMember: {
          id: "member-olga",
          user: { id: "user-olga", name: "Olga" },
          avatarPresentation: {
            type: "image",
            url: "https://example.com/olga.png",
            name: "Olga avatar",
          },
        },
      },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ManagedPostHistoryModal
          open
          channelId="channel-1"
          postId="post-1"
          restorePending={false}
          onClose={vi.fn()}
          onRestore={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Olga updated the post"),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Olga" })).toHaveAttribute(
      "src",
      "https://example.com/olga.png",
    );
  });
});
