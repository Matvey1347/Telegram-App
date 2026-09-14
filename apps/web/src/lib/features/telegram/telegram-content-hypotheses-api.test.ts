import { describe, expect, it, vi } from "vitest";
import { createTelegramContentHypothesesApi } from "./telegram-content-hypotheses-api";

describe("telegram content hypotheses api", () => {
  it("assigns several hypotheses to one managed post", async () => {
    const http = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn().mockResolvedValue({ data: [] }) };
    const client = createTelegramContentHypothesesApi(http as never);
    await client.assignToPost("channel-1", "post-1", { hypothesisIds: ["h1", "h2"] });
    expect(http.put).toHaveBeenCalledWith("/telegram-channels/channel-1/managed-posts/post-1/hypotheses", { hypothesisIds: ["h1", "h2"] });
  });
});
