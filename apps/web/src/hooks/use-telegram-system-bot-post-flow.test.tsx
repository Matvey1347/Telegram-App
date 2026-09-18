import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTelegramSystemBotPostFlow } from "./use-telegram-system-bot-post-flow";

const mocks = vi.hoisted(() => ({
  startPostImport: vi.fn(),
  readPostImport: vi.fn(),
  cancelPostImport: vi.fn(),
  sendPostPreview: vi.fn(),
  confirmImportReplacement: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ telegramSystemBotApi: mocks }));
vi.mock("@/providers/telegram-system-bot-import-conflict-provider", () => ({
  useTelegramSystemBotImportConflict: () => mocks.confirmImportReplacement,
}));

const draft = {
  title: "Imported",
  text: "Post from bot",
  imageUrls: [],
  buttonRows: [],
};

describe("useTelegramSystemBotPostFlow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.startPostImport.mockResolvedValue({
      workflowId: "workflow-1",
      mode: "single",
    });
    mocks.readPostImport.mockResolvedValue({
      ready: false,
      mode: "single",
      status: "ACTIVE",
    });
    mocks.cancelPostImport.mockResolvedValue({
      workflowId: "workflow-1",
      mode: "single",
      status: "CANCELLED",
    });
    mocks.sendPostPreview.mockResolvedValue({ status: "SENT" });
    mocks.confirmImportReplacement.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the canonical single import contract and polls after one second", async () => {
    vi.useFakeTimers();
    mocks.readPostImport.mockResolvedValue({
      ready: true,
      mode: "single",
      status: "COMPLETED",
      drafts: [draft],
    });
    const onImported = vi.fn();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        recoveryKey: "test-consumer",
        onImported,
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());
    expect(mocks.startPostImport).toHaveBeenCalledWith({ mode: "single" });
    expect(storageWrite.mock.calls.slice(0, 2)).toEqual([
      [
        "telegram-system-bot-post-import:workspace-1:single:owner",
        "test-consumer",
      ],
      ["telegram-system-bot-post-import:workspace-1:single", "workflow-1"],
    ]);
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(mocks.readPostImport).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onImported).toHaveBeenCalledWith(draft, "workflow-1");
    expect(result.current.importStatus).toBe("done");
    expect(result.current.terminalStatus).toBe("COMPLETED");
  });

  it("starts the import without opening Telegram in a browser tab by default", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        botUsername: "system_bot",
      }),
    );

    await act(async () => result.current.startImport());

    expect(mocks.startPostImport).toHaveBeenCalledWith({ mode: "single" });
    expect(open).not.toHaveBeenCalled();
    expect(result.current.importStatus).toBe("waiting");
  });

  it("pauses while hidden and reconciles with one read when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "multiple",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(mocks.readPostImport).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(mocks.readPostImport).toHaveBeenCalledTimes(1);
  });

  it("restores by workspace and clears storage for terminal results", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single",
      "restored",
    );
    mocks.readPostImport.mockResolvedValue({
      ready: false,
      mode: "single",
      status: "EXPIRED",
    });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.workflowId).toBe("restored");
    await act(async () => result.current.checkImport());
    expect(result.current.terminalStatus).toBe("EXPIRED");
    expect(
      window.localStorage.getItem(
        "telegram-system-bot-post-import:workspace-1:single",
      ),
    ).toBeNull();
  });

  it("uses one recurring poll owner for duplicate workspace and mode consumers", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single",
      "shared-workflow",
    );
    mocks.readPostImport.mockResolvedValue({
      ready: false,
      mode: "single",
      status: "ACTIVE",
    });
    const useFlow = () =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      });
    const owner = renderHook(useFlow);
    renderHook(useFlow);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(mocks.readPostImport).toHaveBeenCalledTimes(1);

    owner.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(mocks.readPostImport).toHaveBeenCalledTimes(2);
  });

  it("does not restore a workflow owned by another consumer", async () => {
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single",
      "ad-sale-workflow",
    );
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single:owner",
      "ad-sale",
    );
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        recoveryKey: "cross-promotion",
        openBotOnStart: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.workflowId).toBe("");
    expect(mocks.readPostImport).not.toHaveBeenCalled();
  });

  it("keeps a workflow recoverable when cancellation fails", async () => {
    mocks.cancelPostImport.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    await act(async () => result.current.cancelImport());
    expect(result.current.workflowId).toBe("workflow-1");
    expect(result.current.importStatus).toBe("waiting");
    expect(
      window.localStorage.getItem(
        "telegram-system-bot-post-import:workspace-1:single",
      ),
    ).toBe("workflow-1");
  });

  it("sends previews through the canonical endpoint", async () => {
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        previewDraft: draft,
      }),
    );
    await act(async () => result.current.send());
    expect(mocks.sendPostPreview).toHaveBeenCalledWith(draft);
    expect(result.current.sendStatus).toBe("done");
  });

  it("returns every draft for a multiple import", async () => {
    mocks.startPostImport.mockResolvedValueOnce({
      workflowId: "workflow-many",
      mode: "multiple",
    });
    mocks.readPostImport.mockResolvedValueOnce({
      ready: true,
      mode: "multiple",
      status: "COMPLETED",
      drafts: [draft, { ...draft, title: "Second" }],
    });
    const onImported = vi.fn();
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "multiple",
        workspaceId: "workspace-1",
        onImported,
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    await act(async () => result.current.checkImport());
    expect(mocks.startPostImport).toHaveBeenCalledWith({ mode: "multiple" });
    expect(onImported).toHaveBeenCalledWith(
      [draft, expect.objectContaining({ title: "Second" })],
      "workflow-many",
    );
  });

  it("keeps not-ready imports available for manual Check and stops after completion", async () => {
    vi.useFakeTimers();
    mocks.readPostImport
      .mockResolvedValueOnce({ ready: false, mode: "single", status: "ACTIVE" })
      .mockResolvedValueOnce({
        ready: true,
        mode: "single",
        status: "COMPLETED",
        drafts: [draft],
      });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    await act(async () => result.current.checkImport());
    expect(result.current.importStatus).toBe("waiting");
    await act(async () => result.current.checkImport());
    const completedCalls = mocks.readPostImport.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.readPostImport).toHaveBeenCalledTimes(completedCalls);
  });

  it("maps active-import conflicts centrally", async () => {
    mocks.startPostImport.mockRejectedValueOnce(
      Object.assign(new Error("conflict"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { code: "TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE" },
        },
      }),
    );
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    expect(result.current.error).toMatch(/finish or cancel/i);
    expect(result.current.importStatus).toBe("idle");
  });

  it("confirms replacement and starts a new contextual import", async () => {
    mocks.confirmImportReplacement.mockResolvedValueOnce(true);
    mocks.startPostImport
      .mockRejectedValueOnce(
        Object.assign(new Error("conflict"), {
          isAxiosError: true,
          response: {
            status: 409,
            data: { code: "TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE" },
          },
        }),
      )
      .mockResolvedValueOnce({ workflowId: "workflow-2", mode: "single" });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        importContext: "Ad sale",
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());

    expect(mocks.confirmImportReplacement).toHaveBeenCalledOnce();
    expect(mocks.startPostImport).toHaveBeenNthCalledWith(1, {
      mode: "single",
      context: "Ad sale",
    });
    expect(mocks.startPostImport).toHaveBeenNthCalledWith(2, {
      mode: "single",
      context: "Ad sale",
      replaceActive: true,
    });
    expect(result.current.workflowId).toBe("workflow-2");
    expect(result.current.error).toBe("");
  });

  it("lets the same consumer replace its restored unfinished import", async () => {
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single",
      "workflow-old",
    );
    window.localStorage.setItem(
      "telegram-system-bot-post-import:workspace-1:single:owner",
      "post-from-bot",
    );
    mocks.confirmImportReplacement.mockResolvedValueOnce(true);
    mocks.startPostImport.mockResolvedValueOnce({
      workflowId: "workflow-new",
      mode: "single",
    });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        recoveryKey: "post-from-bot",
        importContext: "Mass publication",
        openBotOnStart: false,
      }),
    );
    await act(async () => Promise.resolve());

    await act(async () => result.current.startImport());

    expect(mocks.confirmImportReplacement).toHaveBeenCalledOnce();
    expect(mocks.startPostImport).toHaveBeenCalledWith({
      mode: "single",
      context: "Mass publication",
      replaceActive: true,
    });
    expect(result.current.workflowId).toBe("workflow-new");
  });

  it("shows the generic start error and stays retryable", async () => {
    mocks.startPostImport.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        mode: "single",
        workspaceId: "workspace-1",
        openBotOnStart: false,
      }),
    );
    await act(async () => result.current.startImport());
    expect(result.current.error).toBe("Could not start the bot post import.");
    expect(result.current.workflowId).toBe("");
  });
});
