import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChannelSyncScopeModal,
  DEFAULT_CHANNEL_SYNC_SELECTION,
  WorkspaceChannelSyncModal,
  syncSelectionFromChannel,
} from "./channel-sync-scope-modal";

const { pushToast, syncWorkspaceChannels } = vi.hoisted(() => ({
  pushToast: vi.fn(),
  syncWorkspaceChannels: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { syncWorkspaceChannels },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast }),
}));

describe("ChannelSyncScopeModal", () => {
  beforeEach(() => {
    pushToast.mockReset();
    syncWorkspaceChannels.mockReset();
  });

  it("returns the selected workspace scope and disables an empty submission", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onSubmit = vi.fn();
    const selection = {
      ...DEFAULT_CHANNEL_SYNC_SELECTION,
      syncIncludeInviteLinks: false,
    };

    const { rerender } = render(
      <ChannelSyncScopeModal
        open
        title="Sync all channels"
        description="Choose what to synchronize across workspace channels."
        helperText="One workspace operation is created."
        selection={selection}
        isSyncing={false}
        submitLabel="Sync all channels"
        onClose={vi.fn()}
        onSelectionChange={onSelectionChange}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /invite links/i }));
    expect(onSelectionChange).toHaveBeenCalledWith({
      ...DEFAULT_CHANNEL_SYNC_SELECTION,
      syncIncludeInviteLinks: true,
    });

    rerender(
      <ChannelSyncScopeModal
        open
        title="Sync all channels"
        description="Choose what to synchronize across workspace channels."
        helperText="One workspace operation is created."
        selection={
          Object.fromEntries(
            Object.keys(DEFAULT_CHANNEL_SYNC_SELECTION).map((key) => [
              key,
              false,
            ]),
          ) as typeof DEFAULT_CHANNEL_SYNC_SELECTION
        }
        isSyncing={false}
        submitLabel="Sync all channels"
        onClose={vi.fn()}
        onSelectionChange={onSelectionChange}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sync all channels" }),
    ).toBeDisabled();
  });

  it("keeps the per-channel full-sync action separate from the saved selection", async () => {
    const user = userEvent.setup();
    const onSyncAll = vi.fn();

    render(
      <ChannelSyncScopeModal
        open
        title="Sync Test"
        description="Choose what to sync for this channel."
        helperText="The saved scope is preselected."
        selection={DEFAULT_CHANNEL_SYNC_SELECTION}
        isSyncing={false}
        submitLabel="Sync selected"
        onClose={vi.fn()}
        onSelectionChange={vi.fn()}
        onSubmit={vi.fn()}
        onSyncAll={onSyncAll}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sync all" }));
    expect(onSyncAll).toHaveBeenCalledOnce();
  });

  it("hydrates missing channel preferences with enabled defaults", () => {
    expect(
      syncSelectionFromChannel({
        syncIncludePublicInfo: false,
        syncIncludeInviteLinks: undefined,
      } as Parameters<typeof syncSelectionFromChannel>[0]),
    ).toEqual({
      ...DEFAULT_CHANNEL_SYNC_SELECTION,
      syncIncludePublicInfo: false,
    });
  });

  it("runs one aggregate workspace request and invalidates channel lists once", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    syncWorkspaceChannels.mockResolvedValue({
      total: 100,
      successful: 99,
      failed: 1,
      skipped: 0,
      summary: "Synced 99/100 channels, 1 failed.",
    });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceChannelSyncModal open onClose={onClose} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Sync all channels" }));

    await waitFor(() => expect(syncWorkspaceChannels).toHaveBeenCalledOnce());
    expect(syncWorkspaceChannels).toHaveBeenCalledWith(
      DEFAULT_CHANNEL_SYNC_SELECTION,
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(invalidateQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-channels", "list"],
    });
    expect(pushToast).toHaveBeenCalledWith(
      "Synced 99/100 channels, 1 failed.",
      "info",
      8000,
    );
  });

  it("keeps the workspace modal open and surfaces a failed aggregate request", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    syncWorkspaceChannels.mockRejectedValue({
      response: { data: { message: "No eligible channels" } },
    });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceChannelSyncModal open onClose={onClose} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Sync all channels" }));

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith("No eligible channels", "error"),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Sync all channels" }),
    ).toBeInTheDocument();
  });
});
