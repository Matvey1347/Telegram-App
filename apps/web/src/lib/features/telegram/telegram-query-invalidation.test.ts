import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { telegramAccountKeys, telegramChannelKeys } from "@/lib/query-keys";
import type { TelegramUserAccount } from "@/lib/api-types/telegram/telegram-sources";
import { reconcileTelegramQrLoginSuccess } from "./telegram-query-invalidation";

describe("reconcileTelegramQrLoginSuccess", () => {
  it("patches the authoritative account and invalidates only sync-derived reads", async () => {
    const client = new QueryClient();
    const existing = {
      id: "account-1",
      label: "Old label",
      apiId: "123",
      isPremium: false,
      captionLengthMax: 1024,
      messageLengthMax: 4096,
      status: "error",
      lastErrorMessage: "Revoked",
      isActive: true,
      assignedMember: { id: "member-1" },
    } as TelegramUserAccount;
    client.setQueryData(telegramAccountKeys.accounts(), [existing]);
    const derivedKeys = [
      telegramChannelKeys.sourceChannels(),
      telegramChannelKeys.sources(),
      telegramChannelKeys.publishingCapabilities(),
      telegramChannelKeys.analyticsSources(),
      telegramChannelKeys.list(false, true),
    ];
    derivedKeys.forEach((key) => client.setQueryData(key, { ready: true }));
    client.setQueryData(telegramAccountKeys.bots(), [{ id: "bot-1" }]);

    await reconcileTelegramQrLoginSuccess(client, {
      id: "account-1",
      label: "Authoritative label",
      apiId: "123",
      phoneMasked: null,
      username: "owner",
      isPremium: true,
      captionLengthMax: 4096,
      messageLengthMax: 8192,
      status: "connected",
      lastErrorMessage: null,
      lastCheckedAt: "2026-08-23T10:00:00.000Z",
      isActive: true,
    });

    expect(
      client.getQueryData<TelegramUserAccount[]>(
        telegramAccountKeys.accounts(),
      )?.[0],
    ).toMatchObject({
      label: "Authoritative label",
      username: "owner",
      status: "connected",
      lastErrorMessage: undefined,
      assignedMember: { id: "member-1" },
    });
    derivedKeys.forEach((key) =>
      expect(client.getQueryState(key)?.isInvalidated).toBe(true),
    );
    expect(
      client.getQueryState(telegramAccountKeys.bots())?.isInvalidated,
    ).toBe(false);
    expect(
      client.getQueryState(telegramAccountKeys.accounts())?.isInvalidated,
    ).toBe(true);
  });
});
