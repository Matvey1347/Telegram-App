import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get, post, patch, delete: remove, defaults: { baseURL: "/api" } },
}));

import {
  operationsNotificationsApi,
  parseOperationsNotificationStreamChunk,
} from "./operations-notifications-api";

describe("operationsNotificationsApi", () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: {} });
    post.mockReset().mockResolvedValue({ data: {} });
    patch.mockReset().mockResolvedValue({ data: {} });
    remove.mockReset().mockResolvedValue({ data: {} });
  });

  it("maps bounded list, count, read, preference, and push paths", async () => {
    const signal = new AbortController().signal;
    await operationsNotificationsApi.list(
      { cursor: "next", limit: 50 },
      signal,
    );
    await operationsNotificationsApi.unreadCount(signal);
    await operationsNotificationsApi.markRead("notification-1");
    await operationsNotificationsApi.markVisibleRead(["notification-1"]);
    await operationsNotificationsApi.markAllRead();
    await operationsNotificationsApi.preferences(signal);
    await operationsNotificationsApi.updatePreferences(true);
    await operationsNotificationsApi.pushConfig(signal);
    await operationsNotificationsApi.addPushSubscription({
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "p256dh", auth: "auth" },
    });
    await operationsNotificationsApi.removePushSubscription(
      "https://push.example/subscription",
    );

    expect(get.mock.calls).toEqual([
      [
        "/operations/notifications",
        { params: { cursor: "next", limit: 50 }, signal },
      ],
      ["/operations/notifications/unread-count", { signal }],
      ["/operations/notifications/preferences", { signal }],
      ["/operations/notifications/push/config", { signal }],
    ]);
    expect(post.mock.calls).toEqual([
      ["/operations/notifications/notification-1/read"],
      ["/operations/notifications/read-visible", { ids: ["notification-1"] }],
      ["/operations/notifications/read-all"],
      [
        "/operations/notifications/push/subscriptions",
        {
          endpoint: "https://push.example/subscription",
          keys: { p256dh: "p256dh", auth: "auth" },
        },
      ],
    ]);
    expect(patch).toHaveBeenCalledWith(
      "/operations/notifications/preferences",
      { webPushEnabled: true },
    );
    expect(remove).toHaveBeenCalledWith(
      "/operations/notifications/push/subscriptions",
      { data: { endpoint: "https://push.example/subscription" } },
    );
  });

  it("parses complete SSE events and retains partial frames", () => {
    const first = parseOperationsNotificationStreamChunk(
      "",
      'data: {"type":"notification.created","workspaceId":"workspace-1",',
    );
    expect(first.events).toEqual([]);
    const second = parseOperationsNotificationStreamChunk(
      first.remainder,
      '"recipientMemberId":"member-1","occurredAt":"now","notification":{"id":"n1"}}\n\n',
    );
    expect(second.remainder).toBe("");
    expect(second.events).toEqual([
      expect.objectContaining({ type: "notification.created" }),
    ]);
    const invalidated = parseOperationsNotificationStreamChunk(
      "",
      'data: {"type":"notifications.invalidated","workspaceId":"workspace-1","recipientMemberId":"member-1","occurredAt":"now"}\n\n',
    );
    expect(invalidated.events).toEqual([
      expect.objectContaining({ type: "notifications.invalidated" }),
    ]);
  });
});
