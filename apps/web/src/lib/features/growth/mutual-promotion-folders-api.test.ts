import { beforeEach, describe, expect, it, vi } from "vitest";

const streamProgressAction = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {},
  streamProgressAction,
}));

describe("mutualPromotionFoldersApi activation", () => {
  beforeEach(() => {
    vi.resetModules();
    streamProgressAction.mockReset();
  });

  it("uses the activation stream and forwards real delivery progress", async () => {
    const result = { deliveriesCreated: 10, successCount: 10, failedCount: 0 };
    streamProgressAction.mockResolvedValue(result);
    const { mutualPromotionFoldersApi } =
      await import("./mutual-promotion-folders-api");
    const onProgress = vi.fn();

    await expect(
      mutualPromotionFoldersApi.activate("folder-1", onProgress),
    ).resolves.toBe(result);
    expect(streamProgressAction).toHaveBeenCalledWith(
      "/mutual-promotion-folders/folder-1/activate",
      {},
      onProgress,
    );
  });
});
