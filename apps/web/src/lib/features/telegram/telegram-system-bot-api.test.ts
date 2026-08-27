import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { createTelegramSystemBotApi } from "./telegram-system-bot-api";

describe("telegramSystemBotApi subscriptions", () => {
  it("loads subscriptions for an explicit workspace", async () => {
    const response = {
      connected: true,
      botUsername: "system_bot",
      workspaceId: "workspace-a",
      items: [],
    };
    const get = vi.fn().mockResolvedValue({ data: response });
    const client = createTelegramSystemBotApi({
      get,
    } as unknown as AxiosInstance);

    await expect(client.subscriptions("workspace-a")).resolves.toEqual(
      response,
    );
    expect(get).toHaveBeenCalledWith("/telegram/system-bot/subscriptions", {
      params: { workspaceId: "workspace-a" },
    });
  });

  it("posts the complete recipient preference contract", async () => {
    const payload = {
      workspaceId: "workspace-a",
      taskKey: "telegram.channels.full_sync",
      enabled: true,
      notifyOnSuccess: true,
      notifyOnFailure: false,
    };
    const post = vi.fn().mockResolvedValue({ data: payload });
    const client = createTelegramSystemBotApi({
      post,
    } as unknown as AxiosInstance);

    await expect(client.updateSubscription(payload)).resolves.toEqual(payload);
    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/subscriptions",
      payload,
    );
  });

  it("selects the current website workspace for the connected bot", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true } });
    const client = createTelegramSystemBotApi({
      post,
    } as unknown as AxiosInstance);

    await expect(client.selectCurrentWorkspace()).resolves.toEqual({
      success: true,
    });
    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/connection/workspace",
    );
  });

  it("updates all subscriptions in a task group with one request", async () => {
    const payload = {
      workspaceId: "workspace-a",
      groupKey: "TELEGRAM" as const,
      notifyOnSuccess: true,
      notifyOnFailure: false,
    };
    const post = vi.fn().mockResolvedValue({ data: { items: [] } });
    const client = createTelegramSystemBotApi({ post } as unknown as AxiosInstance);

    await client.updateGroupSubscriptions(payload);

    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/subscriptions/group",
      payload,
    );
  });
});
