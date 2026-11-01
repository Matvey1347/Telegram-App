import type { CrmChatActionRequest, CrmChatActionResult, CrmChatCapabilities } from "@telegram-system/shared";
import { api } from "@/lib/api";

const path = (id: string) => `/telegram-crm/conversations/${encodeURIComponent(id)}`;
export const crmChatActionsApi = {
  capabilities: async (id: string, signal?: AbortSignal) => (await api.get<CrmChatCapabilities>(`${path(id)}/chat-capabilities`, { signal })).data,
  execute: async (id: string, body: CrmChatActionRequest) => (await api.post<CrmChatActionResult>(`${path(id)}/message-actions`, body)).data,
  check: async (id: string, operationId: string) => (await api.get<CrmChatActionResult>(`${path(id)}/message-actions/${encodeURIComponent(operationId)}`)).data,
  upload: async (id: string, body: FormData, signal?: AbortSignal) => (await api.post<CrmChatActionResult>(`${path(id)}/media`, body, { signal })).data,
  download: async (id: string, messageId: string, signal?: AbortSignal) => (await api.get<Blob>(`${path(id)}/messages/${encodeURIComponent(messageId)}/media`, { responseType: "blob", signal })).data,
};
export const chatOperationId = () => `${new Date().toISOString().slice(0, 10)}:${crypto.randomUUID()}`;

/** Only a definitive HTTP rejection proves no operation was admitted. */
export function chatRequestFailure(error: unknown): { status: "FAILED" | "UNKNOWN"; errorCode: string } {
  const response = (error as { response?: { status?: number; data?: { message?: unknown; errorCode?: unknown } } } | null)?.response;
  const code = String(response?.data?.errorCode ?? response?.data?.message ?? `HTTP_${response?.status ?? "RESULT_UNKNOWN"}`).slice(0, 160);
  const definitive = response?.status && response.status >= 400 && response.status < 500 && !/UNKNOWN|PENDING|IN_PROGRESS/i.test(code);
  return { status: definitive ? "FAILED" : "UNKNOWN", errorCode: code };
}
