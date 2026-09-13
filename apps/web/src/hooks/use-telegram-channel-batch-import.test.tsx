import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseTelegramChannelReferences,
  useTelegramChannelBatchImport,
} from "./use-telegram-channel-batch-import";

const { importBatchWithProgress } = vi.hoisted(() => ({
  importBatchWithProgress: vi.fn(),
}));
const { startOperation, updateOperation, succeedOperation, failOperation } =
  vi.hoisted(() => ({
    startOperation: vi.fn(),
    updateOperation: vi.fn(),
    succeedOperation: vi.fn(),
    failOperation: vi.fn(),
  }));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { importBatchWithProgress },
}));
vi.mock("@/providers/toast-provider", () => ({
  useOperationFeedback: () => ({ start: startOperation }),
}));

describe("useTelegramChannelBatchImport", () => {
  beforeEach(() => {
    importBatchWithProgress.mockReset();
    updateOperation.mockReset();
    succeedOperation.mockReset();
    failOperation.mockReset();
    startOperation.mockReset().mockReturnValue({
      update: updateOperation,
      succeed: succeedOperation,
      fail: failOperation,
    });
  });

  it("parses whitespace-separated references and removes duplicates", () => {
    expect(
      parseTelegramChannelReferences(
        "https://t.me/one\n https://t.me/+two  https://t.me/one",
      ),
    ).toEqual(["https://t.me/one", "https://t.me/+two"]);
  });

  it("selects every successfully imported channel from a partial batch", async () => {
    importBatchWithProgress.mockImplementation(async (_inputs, onProgress) => {
      onProgress(
        { input: "https://t.me/one", success: true, channelId: "channel-1" },
        1,
        3,
      );
      onProgress(
        { input: "https://t.me/+bad", success: false, error: "Invalid invite" },
        2,
        3,
      );
      onProgress(
        { input: "https://t.me/two", success: true, channelId: "channel-2" },
        3,
        3,
      );
      return {
        channels: [
          { id: "channel-1", title: "One" },
          { id: "channel-2", title: "Two" },
        ],
        failures: [{ input: "https://t.me/+bad", error: "Invalid invite" }],
      };
    });
    let channels: Array<{ id: string; title: string }> = [];
    let selectedIds = ["existing"];
    const setChannels = vi.fn((update) => {
      channels = update(channels);
    });
    const setSelectedIds = vi.fn((update) => {
      selectedIds = update(selectedIds);
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useTelegramChannelBatchImport({
        setChannels: setChannels as never,
        setSelectedIds,
        onError,
      }),
    );

    await act(() =>
      result.current.importReferences(
        "https://t.me/one https://t.me/+bad https://t.me/two",
      ),
    );

    expect(importBatchWithProgress).toHaveBeenCalledOnce();
    expect(channels.map((channel) => channel.id)).toEqual([
      "channel-1",
      "channel-2",
    ]);
    expect(selectedIds).toEqual(["existing", "channel-1", "channel-2"]);
    expect(updateOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        current: 3,
        total: 3,
        progressSummary: { successful: 2, failed: 1 },
      }),
    );
    expect(succeedOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "2 imported; 1 failed",
        details: expect.stringContaining("Invalid invite"),
      }),
    );
    expect(onError).toHaveBeenLastCalledWith("");
  });

  it("turns the loading operation into one detailed error when every import fails", async () => {
    importBatchWithProgress.mockImplementation(async (_inputs, onProgress) => {
      onProgress(
        {
          input: "https://t.me/+invalid",
          success: false,
          error: "Invite expired",
        },
        1,
        1,
      );
      return {
        channels: [],
        failures: [{ input: "https://t.me/+invalid", error: "Invite expired" }],
      };
    });
    const { result } = renderHook(() =>
      useTelegramChannelBatchImport({
        setChannels: vi.fn(),
        setSelectedIds: vi.fn(),
        onError: vi.fn(),
      }),
    );

    await act(() => result.current.importReferences("https://t.me/+invalid"));

    expect(startOperation).toHaveBeenCalledOnce();
    expect(failOperation).toHaveBeenCalledWith({
      message: "Could not import 1 channel",
      details: "https://t.me/+invalid: Invite expired",
      progressSummary: { successful: 0, failed: 1 },
    });
    expect(succeedOperation).not.toHaveBeenCalled();
  });
});
