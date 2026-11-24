import { api, silentFeedbackConfig } from "@/lib/http/api-client";
import type {
  SupportBotView,
  SupportMessage,
  SupportProduct,
  SupportTicket,
  SupportThreadPage,
} from "@telegram-system/shared";

export type SupportAvatarKind = "sender" | "bot";

const root = "/telegram-support";
export const supportKeys = {
  root: ["telegram-support"] as const,
  summary: ["telegram-support", "summary"] as const,
  list: (closed: boolean, product?: SupportProduct) =>
    ["telegram-support", "list", closed, product] as const,
  avatar: (workspaceId: string, id: string, kind: SupportAvatarKind) =>
    ["telegram-support-avatar", workspaceId, id, kind] as const,
  thread: (id: string | null) => ["telegram-support", "thread", id] as const,
};

type Page<T> = { items: T[]; nextCursor: string | null };
export const telegramSupportApi = {
  avatar: async (id: string, kind: SupportAvatarKind, signal: AbortSignal) => {
    const response = await api.get<Blob>(`${root}/tickets/${encodeURIComponent(id)}/avatar`, {
      ...silentFeedbackConfig,
      params: { kind },
      responseType: "blob",
      signal,
    });
    return response.status === 200 && response.data.size ? response.data : null;
  },
  summary: async () =>
    (await api.get<SupportBotView[]>(`${root}/summary`)).data,
  list: async (closed: boolean, product?: SupportProduct, cursor?: string) =>
    (
      await api.get<Page<SupportTicket>>(`${root}/tickets`, {
        params: { closed, product, cursor },
      })
    ).data,
  thread: async (id: string, cursor?: string) =>
    (
      await api.get<SupportThreadPage>(`${root}/tickets/${id}/messages`, {
        params: { cursor },
      })
    ).data,
  close: async (id: string) => {
    await api.patch(`${root}/tickets/${id}/close`);
  },
  reopen: async (id: string) => (await api.patch<{ id: string }>(`${root}/tickets/${id}/reopen`)).data,
  reply: async (id: string, replyId: string, text: string, targetId?: string) =>
    (
      await api.post<SupportMessage>(`${root}/tickets/${id}/reply`, {
        replyId,
        text,
        formatted: true,
        targetId,
      }, silentFeedbackConfig)
    ).data,
  editMessage: async (id: string, messageId: string, text: string) =>
    (await api.patch<SupportMessage>(`${root}/tickets/${id}/messages/${messageId}`, { text }, silentFeedbackConfig)).data,
  deleteMessage: async (id: string, messageId: string) =>
    (await api.delete<SupportMessage>(`${root}/tickets/${id}/messages/${messageId}`, silentFeedbackConfig)).data,
};

export async function watchSupport(signal: AbortSignal, changed: () => void) {
  const { getAccessToken } = await import("@/lib/features/identity/auth");
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  const token = getAccessToken();
  const workspaceId = window.localStorage.getItem("selected-workspace-id");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${root}/events`, {
    headers,
    signal,
    credentials: "include",
  });
  if (!response.ok || !response.body) return;
  const reader = response.body.getReader();
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value.length) changed();
  }
}
