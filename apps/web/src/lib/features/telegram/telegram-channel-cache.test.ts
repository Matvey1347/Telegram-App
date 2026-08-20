import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  patchTelegramChannelCaches,
  moveTelegramChannelBetweenLifecycleCaches,
  prependTelegramChannelToCaches,
  removeTelegramChannelFromCaches,
} from "./telegram-channel-cache";

const channel = {
  id: "channel-1",
  title: "Channel",
  isActive: true,
  autoSyncEnabled: true,
};

describe("telegram channel cache helpers", () => {
  it("reconciles an entity in list and detail caches without fetching", () => {
    const client = new QueryClient();
    client.setQueryData(telegramChannelKeys.list(), [channel]);
    client.setQueryData(telegramChannelKeys.detail(channel.id), channel);

    patchTelegramChannelCaches(client, { id: channel.id, autoSyncEnabled: false });

    expect(client.getQueryData(telegramChannelKeys.list())).toEqual([
      { ...channel, autoSyncEnabled: false },
    ]);
    expect(client.getQueryData(telegramChannelKeys.detail(channel.id))).toEqual({
      ...channel,
      autoSyncEnabled: false,
    });
  });

  it("inserts and removes deterministic collection items locally", () => {
    const client = new QueryClient();
    client.setQueryData(telegramChannelKeys.list(), [channel]);
    const created = { ...channel, id: "channel-2", title: "New channel" };

    prependTelegramChannelToCaches(client, created);
    removeTelegramChannelFromCaches(client, channel.id);

    expect(client.getQueryData(telegramChannelKeys.list())).toEqual([created]);
    expect(client.getQueryData(telegramChannelKeys.detail(channel.id))).toBeUndefined();
  });

  it("moves an archived channel locally without invalidating either lifecycle list", () => {
    const client = new QueryClient();
    const list = (items: typeof channel[], active: number, archived: number) => ({
      items,
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: items.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      counts: { active, archived },
    });
    client.setQueryData(telegramChannelKeys.list(false, true), list([channel], 1, 0));
    client.setQueryData(telegramChannelKeys.list(true, true), list([], 1, 0));

    moveTelegramChannelBetweenLifecycleCaches(client, {
      ...channel,
      archivedAt: "2026-08-21T00:00:00.000Z",
    });

    expect(client.getQueryData(telegramChannelKeys.list(false, true))).toMatchObject({
      items: [],
      counts: { active: 0, archived: 1 },
    });
    expect(client.getQueryData(telegramChannelKeys.list(true, true))).toMatchObject({
      items: [{ id: channel.id, archivedAt: "2026-08-21T00:00:00.000Z" }],
      counts: { active: 0, archived: 1 },
    });
  });
});
