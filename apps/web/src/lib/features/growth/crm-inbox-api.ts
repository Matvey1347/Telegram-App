import type { CrmInboxConversationsPage, CrmInboxFilter, CrmInboxFoldersResult } from "@telegram-system/shared";
import { api } from "@/lib/api";

export type CrmInboxConversationParams = {
  filter: CrmInboxFilter;
  search?: string;
  folderId?: string;
  limit?: number;
};

export async function listCrmInboxFolders(signal?: AbortSignal) {
  return (await api.get<CrmInboxFoldersResult>("/telegram-crm/inbox/folders", { signal })).data;
}

export async function listCrmInboxConversations(
  params: CrmInboxConversationParams,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return (await api.get<CrmInboxConversationsPage>("/telegram-crm/inbox/conversations", {
    params: { ...params, cursor: cursor || undefined }, signal,
  })).data;
}

export async function setCrmUnreadIgnored(id: string, ignored: boolean) {
  return (await api.post<{ id: string; ignoreInUnread: boolean }>(`/telegram-crm/inbox/conversations/${encodeURIComponent(id)}/unread-ignore`, { ignored }, { feedback: { mode: "managed" } } as Parameters<typeof api.post>[2])).data;
}
