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
