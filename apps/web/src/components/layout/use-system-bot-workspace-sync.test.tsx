import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { useSystemBotWorkspaceSync } from "./use-system-bot-workspace-sync";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    connection: vi.fn(),
    selectCurrentWorkspace: vi.fn(),
  },
}));

describe("useSystemBotWorkspaceSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(telegramSystemBotApi.selectCurrentWorkspace).mockResolvedValue({
      success: true,
    });
  });

  it("synchronizes the initial website workspace and every explicit change", async () => {
    const { rerender } = renderHook(
      ({ workspaceId }) => useSystemBotWorkspaceSync(workspaceId, vi.fn()),
      { initialProps: { workspaceId: "business" } },
    );

    await waitFor(() =>
      expect(telegramSystemBotApi.selectCurrentWorkspace).toHaveBeenCalledTimes(
        1,
      ),
    );
    rerender({ workspaceId: "test" });
    await waitFor(() =>
      expect(telegramSystemBotApi.selectCurrentWorkspace).toHaveBeenCalledTimes(
        2,
      ),
    );
  });

  it("does not make a request before a website workspace is resolved", () => {
    renderHook(() => useSystemBotWorkspaceSync("", vi.fn()));
    expect(telegramSystemBotApi.selectCurrentWorkspace).not.toHaveBeenCalled();
  });

  it("adopts a bot workspace when the user returns to the website", async () => {
    const selectWebsiteWorkspace = vi.fn();
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: true,
      username: "matvii",
      firstName: "Matvii",
      connectedAt: "2026-08-29T08:00:00.000Z",
      currentWorkspaceId: "test",
      currentWorkspaceName: "Test",
      botUsername: "system_bot",
    });
    renderHook(() =>
      useSystemBotWorkspaceSync("business", selectWebsiteWorkspace),
    );

    fireEvent.focus(window);

    await waitFor(() =>
      expect(selectWebsiteWorkspace).toHaveBeenCalledWith("test"),
    );
  });

  it("deduplicates focus reconciliation and runs one trailing check", async () => {
    type Connection = Awaited<
      ReturnType<typeof telegramSystemBotApi.connection>
    >;
    const connection: Connection = {
      connected: true,
      username: "matvii",
      firstName: "Matvii",
      connectedAt: "2026-08-29T08:00:00.000Z",
      currentWorkspaceId: "business",
      currentWorkspaceName: "Business",
      botUsername: "system_bot",
    };
    let resolveConnection!: (connection: Connection) => void;
    vi.mocked(telegramSystemBotApi.connection)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
      )
      .mockResolvedValue(connection);
    renderHook(() => useSystemBotWorkspaceSync("business", vi.fn()));

    fireEvent.focus(window);
    fireEvent.focus(window);
    fireEvent.focus(window);

    await waitFor(() =>
      expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(1),
    );
    fireEvent.focus(window);
    expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnection(connection);
    });

    await waitFor(() =>
      expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(2),
    );

    await act(() => Promise.resolve());
    fireEvent.focus(window);
    await waitFor(() =>
      expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(3),
    );
  });

  it("does not adopt a bot workspace after unmount", async () => {
    const selectWebsiteWorkspace = vi.fn();
    let resolveConnection!: (
      connection: Awaited<ReturnType<typeof telegramSystemBotApi.connection>>,
    ) => void;
    vi.mocked(telegramSystemBotApi.connection).mockReturnValue(
      new Promise((resolve) => {
        resolveConnection = resolve;
      }),
    );
    const { unmount } = renderHook(() =>
      useSystemBotWorkspaceSync("business", selectWebsiteWorkspace),
    );
    fireEvent.focus(window);
    await waitFor(() =>
      expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(1),
    );

    unmount();
    await act(async () => {
      resolveConnection({
        connected: true,
        username: "matvii",
        firstName: "Matvii",
        connectedAt: "2026-08-29T08:00:00.000Z",
        currentWorkspaceId: "test",
        currentWorkspaceName: "Test",
        botUsername: "system_bot",
      });
    });

    expect(selectWebsiteWorkspace).not.toHaveBeenCalled();
  });
});
