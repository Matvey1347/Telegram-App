import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  patchTelegramChannelCaches,
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
});
