import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { createTelegramChannelsApi } from "./telegram-channels-api";

describe("telegramChannelsApi.syncWorkspaceChannels", () => {
  it("runs one workspace request with the complete selected scope", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        workspaceName: "Workspace",
        total: 100,
        successful: 99,
        failed: 1,
        skipped: 0,
        durationMs: 1200,
        summary: "Synced 99/100 channels, 1 failed.",
        failures: [],
      },
    });
    const quietMutationConfig = { headers: { "x-feedback": "quiet" } };
    const client = createTelegramChannelsApi({
      api: { post } as unknown as AxiosInstance,
      crud: vi.fn(() => ({
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      })),
      getPaginated: vi.fn(),
      getAllPaginatedItems: vi.fn(),
      streamBulkAction: vi.fn(),
      streamProgressAction: vi.fn(),
      silentFeedbackConfig: {},
      quietMutationConfig,
    });
    const selection = {
      syncIncludePublicInfo: true,
      syncIncludeInviteLinks: false,
      syncIncludeHistoricalPosts: true,
      syncIncludePostMetrics: true,
      syncIncludeOlderPosts: false,
      syncIncludeChannelStats: true,
      syncIncludeManagedPosts: true,
      syncIncludeAudienceSnapshot: true,
    };

    const result = await client.syncWorkspaceChannels(selection);

    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      "/telegram-sync/workspace-channels/run",
      { selection },
      quietMutationConfig,
    );
    expect(result.total).toBe(100);
  });
});

describe("telegramChannelsApi workspace custom emoji packs", () => {
  it("uses workspace endpoints without channel targeting", async () => {
    const get = vi.fn().mockResolvedValue({ data: { packs: [] } });
    const post = vi.fn().mockResolvedValue({ data: { packs: [] } });
    const remove = vi.fn().mockResolvedValue({ data: { packs: [] } });
    const client = createTelegramChannelsApi({
      api: { get, post, delete: remove } as unknown as AxiosInstance,
      crud: vi.fn(() => ({
        list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
      })),
      getPaginated: vi.fn(),
      getAllPaginatedItems: vi.fn(),
      streamBulkAction: vi.fn(),
      streamProgressAction: vi.fn(),
      silentFeedbackConfig: {},
      quietMutationConfig: {},
    });

    await client.customEmojiPacks();
    await client.importCustomEmojiPack({ source: "https://t.me/addemoji/team" });
    await client.detachCustomEmojiPack("pack_1");

    expect(get).toHaveBeenCalledWith("/telegram-custom-emoji-packs");
    expect(post).toHaveBeenCalledWith("/telegram-custom-emoji-packs/import", {
      source: "https://t.me/addemoji/team",
    });
    expect(remove).toHaveBeenCalledWith("/telegram-custom-emoji-packs/pack_1");
  });
});
