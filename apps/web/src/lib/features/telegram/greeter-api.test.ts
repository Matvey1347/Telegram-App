import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { createGreeterApi } from "./greeter-api";

function client() {
  const axios = {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  };
  return {
    axios,
    greeter: createGreeterApi(axios as unknown as AxiosInstance),
  };
}

describe("createGreeterApi", () => {
  it("preserves draft revision on save and publish", async () => {
    const { axios, greeter } = client();
    const steps = [
      {
        position: 0,
        delaySeconds: 30,
        enabled: true,
        messageText: "Hi",
        buttons: [],
      },
    ];
    await greeter.saveDraft("bot-1", "sequence-1", 7, steps);
    await greeter.publishSequence("bot-1", "sequence-1", 7);
    expect(axios.put).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/automations/sequence-1/draft",
      { draftRevision: 7, steps },
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/automations/sequence-1/publish",
      { draftRevision: 7 },
    );
  });

  it("publishes configuration with its draft revision", async () => {
    const { axios, greeter } = client();
    await greeter.publishConfig("bot-1", 9);
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/config/publish",
      { draftRevision: 9 },
    );
  });

  it("creates a channel-scoped automation through the existing resource", async () => {
    const { axios, greeter } = client();
    await greeter.createSequence("bot-1", {
      name: "Channel welcome",
      trigger: "AFTER_START",
      channelId: "channel-1",
    });
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/automations",
      {
        name: "Channel welcome",
        trigger: "AFTER_START",
        channelId: "channel-1",
      },
    );
  });

  it("uses the bot-level test mode lifecycle endpoints", async () => {
    const { axios, greeter } = client();
    await greeter.testMode("bot-1");
    await greeter.resolveTestUser("bot-1", { username: "tester" });
    await greeter.enableTestMode("bot-1", {
      telegramBotUserId: "user-1",
      channelId: "channel-1",
    });
    await greeter.resetTestMode("bot-1");
    await greeter.disableTestMode("bot-1");
    expect(axios.get).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/test-mode",
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/test-mode/resolve",
      { username: "tester" },
    );
    expect(axios.put).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/test-mode",
      { telegramBotUserId: "user-1", channelId: "channel-1" },
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/test-mode/reset",
    );
    expect(axios.delete).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/test-mode",
    );
  });

  it("uses explicit confirmation endpoints for send, schedule, and test reset", async () => {
    const { axios, greeter } = client();
    await greeter.sendBroadcastNow("bot-1", "broadcast-1");
    await greeter.scheduleBroadcast(
      "bot-1",
      "broadcast-1",
      "2026-08-10T12:00:00.000Z",
    );
    await greeter.resetTest("bot-1", "sequence-1");
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/broadcasts/broadcast-1/send-now",
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/broadcasts/broadcast-1/schedule",
      { scheduledAt: "2026-08-10T12:00:00.000Z" },
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/automations/sequence-1/test/reset",
    );
  });

  it("sends template variables and buttons to the common preview endpoint", async () => {
    const { axios, greeter } = client();
    await greeter.previewTemplate(
      "bot-1",
      "Hi {{first_name}}",
      { channelId: "channel-1" },
      [[{ text: "Open", url: "https://example.com" }]],
    );
    expect(axios.post).toHaveBeenCalledWith(
      "/telegram-bots/bot-1/greeter/preview",
      {
        messageText: "Hi {{first_name}}",
        buttons: [[{ text: "Open", url: "https://example.com" }]],
        channelId: "channel-1",
      },
    );
  });
});
