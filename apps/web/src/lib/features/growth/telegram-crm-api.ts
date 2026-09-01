import type {
  CrmAccountCapabilities,
  CrmAccountSyncState,
  CrmContact,
  CrmContactDetail,
  CrmContactMergeResult,
  CrmContactsListResult,
  CrmContactStage,
  CrmConversationListItem,
  CrmConversationReadResult,
  CrmConversationsListResult,
  CrmFollowUpView,
  CrmHistoryImportResult,
  CrmInboxListResult,
  CrmInboxPromotionResult,
  CrmInboxPromotionStage,
  CrmInboxStateResult,
  CrmInitialSyncResult,
  CrmManualMessageResult,
  CrmMessagesCursorPage,
  CrmPeer,
  CrmRealtimeEvent,
  CrmUnreadSummary,
  CrmWorkspaceSettings,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

export type CrmContactsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  stage?: CrmContactStage;
  ownerMemberId?: string;
  followUpView?: CrmFollowUpView;
  dueFrom?: string;
  dueTo?: string;
  archived?: boolean;
};

export type CrmInboxParams = {
  page?: number;
  pageSize?: number;
  state?: "ACTIVE" | "IGNORED" | "ARCHIVED";
};

export type CrmConversationsParams = {
  page?: number;
  pageSize?: number;
  contactId?: string;
  accountId?: string;
  telegramCrmPeerId?: string;
  state?: "ACTIVE" | "IGNORED" | "ARCHIVED";
};

export type CreateCrmContactPayload = Pick<CrmContact, "displayName"> &
  Partial<
    Pick<
      CrmContact,
      | "companyName"
      | "telegramUsername"
      | "phone"
      | "email"
      | "website"
      | "description"
      | "source"
      | "stage"
      | "ownerMemberId"
      | "nextContactAt"
    >
  >;

export type UpdateCrmContactPayload = Partial<
  Omit<CreateCrmContactPayload, "displayName"> & {
    displayName: string;
  }
>;

export type CreateCrmConversationPayload = {
  telegramCrmPeerId: string;
  contactId?: string | null;
  accountId?: string;
  telegramDialogId: string;
};

export const telegramCrmApi = {
  listContacts: async (params: CrmContactsParams, signal?: AbortSignal) =>
    (
      await api.get<CrmContactsListResult>("/telegram-crm/contacts", {
        params,
        signal,
      })
    ).data,
  getContact: async (contactId: string, signal?: AbortSignal) =>
    (
      await api.get<CrmContactDetail>(`/telegram-crm/contacts/${contactId}`, {
        signal,
      })
    ).data,
  createContact: async (payload: CreateCrmContactPayload) =>
    (await api.post<CrmContact>("/telegram-crm/contacts", payload)).data,
  updateContact: async (contactId: string, payload: UpdateCrmContactPayload) =>
    (
      await api.patch<CrmContact>(
        `/telegram-crm/contacts/${contactId}`,
        payload,
      )
    ).data,
  archiveContact: async (contactId: string) =>
    (await api.post<CrmContact>(`/telegram-crm/contacts/${contactId}/archive`))
      .data,
  restoreContact: async (contactId: string) =>
    (await api.post<CrmContact>(`/telegram-crm/contacts/${contactId}/restore`))
      .data,
  listInbox: async (params: CrmInboxParams, signal?: AbortSignal) =>
    (
      await api.get<CrmInboxListResult>("/telegram-crm/inbox", {
        params,
        signal,
      })
    ).data,
  promoteInboxPeer: async (peerId: string, stage: CrmInboxPromotionStage) =>
    (
      await api.post<CrmInboxPromotionResult>(
        `/telegram-crm/inbox/${peerId}/promote`,
        { stage },
      )
    ).data,
  setInboxPeerState: async (
    peerId: string,
    state: "ACTIVE" | "IGNORED" | "ARCHIVED",
  ) =>
    (
      await api.post<CrmInboxStateResult>(
        `/telegram-crm/inbox/${peerId}/state`,
        { state },
      )
    ).data,
  mergeContacts: async (targetId: string, sourceContactId: string) =>
    (
      await api.post<CrmContactMergeResult>(
        `/telegram-crm/contacts/${targetId}/merge`,
        { sourceContactId },
      )
    ).data,
  upsertPeer: async (payload: {
    telegramUserId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    contactId?: string | null;
  }) => (await api.post<CrmPeer>("/telegram-crm/peers", payload)).data,
  listConversations: async (
    params: CrmConversationsParams,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CrmConversationsListResult>("/telegram-crm/conversations", {
        params,
        signal,
      })
    ).data,
  getConversation: async (conversationId: string, signal?: AbortSignal) =>
    (
      await api.get<CrmConversationListItem>(
        `/telegram-crm/conversations/${conversationId}`,
        { signal },
      )
    ).data,
  createConversation: async (payload: CreateCrmConversationPayload) =>
    (
      await api.post<CrmConversationListItem>(
        "/telegram-crm/conversations",
        payload,
      )
    ).data,
  listMessages: async (
    conversationId: string,
    cursor: string | null,
    pageSize = 50,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CrmMessagesCursorPage>(
        `/telegram-crm/conversations/${conversationId}/messages`,
        { params: { cursor: cursor || undefined, pageSize }, signal },
      )
    ).data,
  sendManualMessage: async (
    conversationId: string,
    payload: { text: string; clientIdempotencyKey: string },
  ) =>
    (
      await api.post<CrmManualMessageResult>(
        `/telegram-crm/conversations/${conversationId}/messages`,
        payload,
      )
    ).data,
  markConversationRead: async (conversationId: string) =>
    (
      await api.post<CrmConversationReadResult>(
        `/telegram-crm/conversations/${conversationId}/read`,
      )
    ).data,
  importHistory: async (
    conversationId: string,
    payload: { beforeTelegramMessageId?: number; limit?: number },
  ) =>
    (
      await api.post<CrmHistoryImportResult>(
        `/telegram-crm/conversations/${conversationId}/history`,
        payload,
      )
    ).data,
  getUnread: async (signal?: AbortSignal) =>
    (await api.get<CrmUnreadSummary>("/telegram-crm/unread", { signal })).data,
  getSettings: async (signal?: AbortSignal) =>
    (await api.get<CrmWorkspaceSettings>("/telegram-crm/settings", { signal }))
      .data,
  updateSettings: async (payload: {
    defaultCrmSenderAccountId?: string | null;
  }) =>
    (await api.patch<CrmWorkspaceSettings>("/telegram-crm/settings", payload))
      .data,
  getAccountCapabilities: async (accountId: string, signal?: AbortSignal) =>
    (
      await api.get<CrmAccountCapabilities>(
        `/telegram-crm/accounts/${accountId}/capabilities`,
        { signal },
      )
    ).data,
  updateAccountCapabilities: async (
    accountId: string,
    payload: Partial<Omit<CrmAccountCapabilities, "accountId">>,
  ) =>
    (
      await api.patch<CrmAccountCapabilities>(
        `/telegram-crm/accounts/${accountId}/capabilities`,
        payload,
      )
    ).data,
  getAccountSyncState: async (accountId: string, signal?: AbortSignal) =>
    (
      await api.get<CrmAccountSyncState>(
        `/telegram-crm/accounts/${accountId}/sync-state`,
        { signal },
      )
    ).data,
  initialSync: async (accountId: string) =>
    (
      await api.post<CrmInitialSyncResult>(
        `/telegram-crm/accounts/${accountId}/initial-sync`,
      )
    ).data,
};

export type CrmEventStreamOptions = {
  signal: AbortSignal;
  onEvent: (event: CrmRealtimeEvent) => void;
  onOpen?: () => void;
};

export function parseCrmEventStreamChunk(
  buffered: string,
  chunk: string,
): { events: CrmRealtimeEvent[]; remainder: string } {
  const blocks = `${buffered}${chunk}`.replace(/\r\n/g, "\n").split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: CrmRealtimeEvent[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as CrmRealtimeEvent);
    } catch {
      // Ignore an invalid server event while keeping the stream alive.
    }
  }
  return { events, remainder };
}

export async function fetchCrmEventStream({
  signal,
  onEvent,
  onOpen,
}: CrmEventStreamOptions): Promise<void> {
  const { getAccessToken } = await import("@/lib/features/identity/auth");
  const token = getAccessToken();
  const workspaceId = window.localStorage.getItem("selected-workspace-id");
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/telegram-crm/events/stream`, {
    headers,
    credentials: "include",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`CRM realtime connection failed (${response.status}).`);
  }
  onOpen?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseCrmEventStreamChunk(
      buffered,
      decoder.decode(value, { stream: true }),
    );
    buffered = parsed.remainder;
    parsed.events.forEach(onEvent);
  }
}
