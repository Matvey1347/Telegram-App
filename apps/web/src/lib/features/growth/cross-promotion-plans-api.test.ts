import { beforeEach, describe, expect, it, vi } from "vitest";

const streamProgressAction = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {},
  streamProgressAction,
}));

describe("crossPromotionPlansApi publication updates", () => {
  beforeEach(() => {
    vi.resetModules();
    streamProgressAction.mockReset();
  });

  it("streams a PATCH update for one partner post", async () => {
    const result = { id: "plan-1" };
    const payload = { title: "Partner post" };
    const onProgress = vi.fn();
    streamProgressAction.mockResolvedValue(result);
    const { crossPromotionPlansApi } =
      await import("./cross-promotion-plans-api");

    await expect(
      crossPromotionPlansApi.updatePublicationInTelegram(
        "plan-1",
        "publication-1",
        payload as never,
        onProgress,
      ),
    ).resolves.toBe(result);

    expect(streamProgressAction).toHaveBeenCalledWith(
      "/cross-promotion-plans/plan-1/publications/publication-1/telegram",
      payload,
      onProgress,
      { method: "PATCH" },
    );
  });
});
