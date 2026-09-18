import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get, post, patch, delete: remove },
}));

import { telegramChannelMessageTemplatesApi } from "./telegram-channel-message-templates-api";

describe("telegramChannelMessageTemplatesApi", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: [] });
    post.mockReset().mockResolvedValue({ data: { channels: [] } });
    patch.mockReset().mockResolvedValue({ data: {} });
    remove.mockReset().mockResolvedValue({ data: {} });
  });

  it("loads preview source silently because the POST is a read operation", async () => {
    await telegramChannelMessageTemplatesApi.source(["channel-1"]);

    expect(post).toHaveBeenCalledWith(
      "/telegram-channel-message-templates/source",
      { channelIds: ["channel-1"] },
      { feedback: { mode: "silent" } },
    );
  });
});
