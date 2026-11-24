import { api } from "@/lib/api";
import type {
  SupportBotView,
  SupportMessage,
  SupportProduct,
  SupportTicket,
} from "@telegram-system/shared";

const root = "/telegram-support";
export const supportKeys = {
  root: ["telegram-support"] as const,
  summary: ["telegram-support", "summary"] as const,
  list: (closed: boolean, product?: SupportProduct) =>
    ["telegram-support", "list", closed, product] as const,
  thread: (id: string | null) => ["telegram-support", "thread", id] as const,
};

type Page<T> = { items: T[]; nextCursor: string | null };
export const telegramSupportApi = {
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
      await api.get<Page<SupportMessage>>(`${root}/tickets/${id}/messages`, {
        params: { cursor },
      })
    ).data,
  close: async (id: string) => {
    await api.patch(`${root}/tickets/${id}/close`);
  },
  reply: async (id: string, replyId: string, text: string) =>
    (
      await api.post<SupportMessage>(`${root}/tickets/${id}/reply`, {
        replyId,
        text,
      })
    ).data,
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
