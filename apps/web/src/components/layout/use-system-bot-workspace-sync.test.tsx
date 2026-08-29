import { fireEvent, renderHook, waitFor } from "@testing-library/react";
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
      expect(
        telegramSystemBotApi.selectCurrentWorkspace,
      ).toHaveBeenCalledTimes(1),
    );
    rerender({ workspaceId: "test" });
    await waitFor(() =>
      expect(
        telegramSystemBotApi.selectCurrentWorkspace,
      ).toHaveBeenCalledTimes(2),
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
});
