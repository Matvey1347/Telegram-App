import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { ManagedPostHistoryModal } from "./managed-post-history-modal";

const { managedPostHistory } = vi.hoisted(() => ({
  managedPostHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { managedPostHistory },
}));

describe("ManagedPostHistoryModal", () => {
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
});
