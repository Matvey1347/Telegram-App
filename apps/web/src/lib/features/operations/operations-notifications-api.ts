import type {
  OperationsNotificationPage,
  OperationsNotificationPreferences,
  OperationsNotificationPushConfig,
  OperationsNotificationRealtimeEvent,
  OperationsNotificationUnreadCount,
  OperationsPushSubscriptionInput,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

const BASE_PATH = "/operations/notifications";

export const operationsNotificationsApi = {
  list: async (
    params: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    (
      await api.get<OperationsNotificationPage>(BASE_PATH, {
        params,
        signal,
      })
    ).data,
  unreadCount: async (signal?: AbortSignal) =>
    (
      await api.get<OperationsNotificationUnreadCount>(
        `${BASE_PATH}/unread-count`,
        { signal },
      )
    ).data,
  markRead: async (id: string) =>
    (
      await api.post<OperationsNotificationUnreadCount>(
        `${BASE_PATH}/${id}/read`,
      )
    ).data,
  markVisibleRead: async (ids: string[]) =>
    (
      await api.post<OperationsNotificationUnreadCount>(
        `${BASE_PATH}/read-visible`,
        { ids },
      )
    ).data,
  markAllRead: async () =>
    (await api.post<OperationsNotificationUnreadCount>(`${BASE_PATH}/read-all`))
      .data,
  preferences: async (signal?: AbortSignal) =>
    (
      await api.get<OperationsNotificationPreferences>(
        `${BASE_PATH}/preferences`,
        { signal },
      )
    ).data,
  updatePreferences: async (webPushEnabled: boolean) =>
    (
      await api.patch<OperationsNotificationPreferences>(
        `${BASE_PATH}/preferences`,
        { webPushEnabled },
      )
    ).data,
  pushConfig: async (signal?: AbortSignal) =>
    (
      await api.get<OperationsNotificationPushConfig>(
        `${BASE_PATH}/push/config`,
        { signal },
      )
    ).data,
  addPushSubscription: async (payload: OperationsPushSubscriptionInput) =>
    (
      await api.post<OperationsNotificationPreferences>(
        `${BASE_PATH}/push/subscriptions`,
        payload,
      )
    ).data,
  removePushSubscription: async (endpoint: string) =>
    (
      await api.delete<OperationsNotificationPreferences>(
        `${BASE_PATH}/push/subscriptions`,
        { data: { endpoint } },
      )
    ).data,
};

export function parseOperationsNotificationStreamChunk(
  buffered: string,
  chunk: string,
): { events: OperationsNotificationRealtimeEvent[]; remainder: string } {
  const blocks = `${buffered}${chunk}`.replace(/\r\n/g, "\n").split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: OperationsNotificationRealtimeEvent[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const event = JSON.parse(data) as OperationsNotificationRealtimeEvent;
      if (
        event.type === "notification.created" ||
        event.type === "notifications.invalidated"
      ) {
        events.push(event);
      }
    } catch {
      // A malformed event must not terminate the long-lived stream.
    }
  }
  return { events, remainder };
}

export async function fetchOperationsNotificationStream({
  signal,
  onEvent,
  onOpen,
}: {
  signal: AbortSignal;
  onEvent: (event: OperationsNotificationRealtimeEvent) => void;
  onOpen?: () => void;
}) {
  const { getAccessToken } = await import("@/lib/features/identity/auth");
  const token = getAccessToken();
  const workspaceId = window.localStorage.getItem("selected-workspace-id");
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${BASE_PATH}/events/stream`, {
    headers,
    credentials: "include",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Notification stream failed (${response.status}).`);
  }
  onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseOperationsNotificationStreamChunk(
      buffered,
      decoder.decode(value, { stream: true }),
    );
    buffered = parsed.remainder;
    parsed.events.forEach(onEvent);
  }
}
