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

const { clearProgress, pushToast, setProgress, syncWorkspaceChannels } = vi.hoisted(() => ({
  clearProgress: vi.fn(),
  pushToast: vi.fn(),
  setProgress: vi.fn(),
  syncWorkspaceChannels: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    syncWorkspaceChannelsWithProgress: syncWorkspaceChannels,
  },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ clearProgress, pushToast, setProgress }),
}));

describe("ChannelSyncScopeModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushToast.mockReset();
    setProgress.mockReset();
    clearProgress.mockReset();
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
    syncWorkspaceChannels.mockImplementation(async (_selection, onProgress) => {
      onProgress(
        {
          phase: "channel_progress",
          channelId: "channel-2",
          channelTitle: "Channel Two",
          message: "Saving invite links…",
          stageCurrent: 3,
          stageTotal: 8,
          successful: 1,
          failed: 0,
          skipped: 0,
        },
        2,
        100,
      );
      return {
      total: 100,
      successful: 99,
      failed: 1,
      skipped: 0,
      summary: "Synced 99/100 channels, 1 failed.",
      };
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
    expect(setProgress).toHaveBeenCalledWith({
      id: "workspace-channel-sync",
      title: "Sync all channels",
      message: "Synchronizing active workspace channels…",
    });
    expect(syncWorkspaceChannels).toHaveBeenCalledWith(
      DEFAULT_CHANNEL_SYNC_SELECTION,
      expect.any(Function),
    );
    expect(setProgress).toHaveBeenCalledWith({
      id: "workspace-channel-sync",
      title: "Sync all channels",
      current: 2,
      total: 100,
      message: "Channel Two: Saving invite links… (3/8)",
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
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
    expect(setProgress).toHaveBeenLastCalledWith({
      id: "workspace-channel-sync",
      title: "Sync all channels",
      message: "Synced 99/100 channels, 1 failed.",
      completed: true,
      successCount: 99,
      failedCount: 1,
      skippedCount: 0,
    });
  });

  it("restores the previously selected workspace synchronization scope", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const first = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceChannelSyncModal open onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("checkbox", { name: /invite links/i }));
    expect(
      screen.getByRole("checkbox", { name: /invite links/i }),
    ).not.toBeChecked();
    first.unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceChannelSyncModal open onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("checkbox", { name: /invite links/i }),
    ).not.toBeChecked();
    expect(screen.getByText("Selected: 7/8")).toBeInTheDocument();
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
    expect(clearProgress).toHaveBeenCalledWith("workspace-channel-sync");
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Sync all channels" }),
    ).toBeInTheDocument();
  });
});
