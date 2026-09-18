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
      undefined,
      { feedback: { mode: "silent" } },
    );
  });

  it("sends an edited post to the canonical preview endpoint", async () => {
    const draft = {
      title: "Post",
      text: "**Preview**",
      plainText: "Preview",
      formattedHtml: "<b>Preview</b>",
      imageUrls: ["https://cdn.test/post.jpg"],
      buttonRows: [],
    };
    const post = vi.fn().mockResolvedValue({ data: { status: "SENT" } });
    const client = createTelegramSystemBotApi({
      post,
    } as unknown as AxiosInstance);

    await expect(client.sendPostPreview(draft)).resolves.toEqual(
      { status: "SENT" },
    );
    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/post-preview",
      {
        title: "Post",
        text: "**Preview**",
        imageUrls: ["https://cdn.test/post.jpg"],
        buttonRows: [],
      },
      { feedback: { mode: "silent" } },
    );
  });

  it("starts a canonical multiple-post import", async () => {
    const post = vi.fn().mockResolvedValue({ data: { workflowId: "flow-1", mode: "multiple" } });
    const client = createTelegramSystemBotApi({
      post,
    } as unknown as AxiosInstance);

    await expect(
      client.startPostImport({
        mode: "multiple",
        context: "Mass publication",
        replaceActive: true,
      }),
    ).resolves.toEqual({
      workflowId: "flow-1",
      mode: "multiple",
    });
    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/post-imports",
      {
        mode: "multiple",
        context: "Mass publication",
        replaceActive: true,
      },
      { feedback: { mode: "silent" } },
    );
  });

  it("bypasses browser caches while checking a bot import result", async () => {
    const get = vi.fn().mockResolvedValue({ data: { ready: false } });
    const client = createTelegramSystemBotApi({
      get,
    } as unknown as AxiosInstance);

    await client.readPostImport("workflow-1");

    expect(get).toHaveBeenCalledWith(
      "/telegram/system-bot/post-imports/workflow-1",
      expect.objectContaining({
        headers: { "Cache-Control": "no-cache" },
        params: expect.objectContaining({ _: expect.any(Number) }),
      }),
    );
  });

  it("cancels the exact canonical workflow", async () => {
    const del = vi.fn().mockResolvedValue({ data: { workflowId: "flow/1", mode: "single", status: "CANCELLED" } });
    const client = createTelegramSystemBotApi({ delete: del } as unknown as AxiosInstance);
    await client.cancelPostImport("flow/1");
    expect(del).toHaveBeenCalledWith(
      "/telegram/system-bot/post-imports/flow%2F1",
      { feedback: { mode: "silent" } },
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
    const client = createTelegramSystemBotApi({
      post,
    } as unknown as AxiosInstance);

    await client.updateGroupSubscriptions(payload);

    expect(post).toHaveBeenCalledWith(
      "/telegram/system-bot/subscriptions/group",
      payload,
    );
  });
});
