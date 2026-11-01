"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CrmConversationListItem,
  CrmMessageListItem,
  CrmCopilotSendApproval,
} from "@telegram-system/shared";
import { chatRequestFailure } from "@/lib/features/growth/crm-chat-actions-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  appendCrmMessage,
  markOptimisticCrmMessageFailed,
  reconcileCrmConversationUnread,
  reconcileCrmMessage,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import {
  patchInboxConversation,
  patchInboxMessage,
} from "@/lib/features/growth/crm-inbox-cache";

function optimisticMessage(
  conversation: CrmConversationListItem,
  text: string,
  key: string,
  ai?: CrmCopilotSendApproval,
  replyToMessageId?: string,
): CrmMessageListItem {
  const now = new Date().toISOString();
  return {
    id: `optimistic:${key}`,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    telegramMessageId: `pending:${key}`,
    telegramMessageIdNumeric: null,
    clientIdempotencyKey: key,
    mtprotoAccountId: conversation.mtprotoAccountId,
    direction: "OUTBOUND",
    origin: "MANUAL",
    sentByMemberId: null,
    text,
    contentMetadata: ai || replyToMessageId ? { ...ai, ...(replyToMessageId ? { replyToMessageId } : {}) } : null,
    sentAt: now,
    editedAt: null,
    readState: "UNKNOWN",
    deliveryState: "PENDING",
    createdAt: now,
    sentByMember: null,
  };
}

export function useCrmThread(conversation: CrmConversationListItem) {
  const client = useQueryClient();
  const sending = useRef(false);
  const recentRequested = useRef(false);
  const loadingOlder = useRef(false);
  const [unknownSend, setUnknownSend] = useState(false);
  const [history, setHistory] = useState({
    exhausted: conversation.historyExhausted,
    before: undefined as number | undefined,
  });
  const query = useInfiniteQuery({
    queryKey: telegramCrmKeys.messagesInfinite(conversation.id),
    queryFn: ({ pageParam, signal }) =>
      telegramCrmApi.listMessages(conversation.id, pageParam, 50, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
    staleTime: 60_000,
  });
  const messages = useMemo(() => {
    const unique = new Map<string, CrmMessageListItem>();
    for (const page of query.data?.pages ?? [])
      for (const message of page.items) unique.set(message.id, message);
    return [...unique.values()].sort(
      (a, b) => a.sentAt.localeCompare(b.sentAt) ||
        (a.telegramMessageIdNumeric != null && b.telegramMessageIdNumeric != null
          ? a.telegramMessageIdNumeric - b.telegramMessageIdNumeric
          : a.id.localeCompare(b.id)),
    );
  }, [query.data]);
  const importHistory = useMutation({
    mutationFn: () =>
      telegramCrmApi.importHistory(conversation.id, {
        limit: 51,
        ...(history.before ? { beforeTelegramMessageId: history.before } : {}),
      }),
    onSuccess: async (result) => {
      setHistory({
        exhausted: result.exhausted,
        before: result.nextBeforeTelegramMessageId ?? undefined,
      });
      // Refetch the saved pages, then reveal newly imported rows in the same
      // interaction instead of requiring a second Load older click.
      const refreshed = await query.refetch();
      if (refreshed.data?.pages.at(-1)?.hasMore) await query.fetchNextPage();
    },
  });
  const refreshRecent = useMutation({
    mutationFn: () => telegramCrmApi.importHistory(conversation.id, { limit: 100, recent: true }),
    onSuccess: async (result) => {
      setHistory({
        exhausted: result.exhausted,
        before: result.nextBeforeTelegramMessageId ?? undefined,
      });
      if (result.scanned > 0) await query.refetch();
    },
    retry: false,
  });
  const refreshRecentMutate = refreshRecent.mutate;
  useEffect(() => {
    if (!query.isSuccess || recentRequested.current) return;
    recentRequested.current = true;
    refreshRecentMutate();
  }, [query.isSuccess, refreshRecentMutate]);
  const markRead = useMutation({
    mutationFn: () => telegramCrmApi.markConversationRead(conversation.id),
    onSuccess: (result) => {
      reconcileCrmConversationUnread(
        client,
        conversation.id,
        conversation.contactId,
        result.unreadCount,
        conversation.unreadCount,
      );
      patchInboxConversation(client, conversation.id, {
        unreadCount: result.unreadCount,
        readState: result.unreadCount ? "UNREAD" : "READ",
      });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.unread() });
    },
  });
  const send = useMutation({
    mutationFn: ({
      body,
      key,
      ai,
      replyToMessageId,
    }: {
      body: string;
      key: string;
      ai?: CrmCopilotSendApproval;
      replyToMessageId?: string;
    }) =>
      telegramCrmApi.sendManualMessage(conversation.id, {
        text: body,
        clientIdempotencyKey: key,
        ...(ai ?? {}),
        ...(replyToMessageId ? { replyToMessageId } : {}),
      }),
    onMutate: ({ body, key, ai, replyToMessageId }) => {
      appendCrmMessage(
        client,
        conversation.id,
        optimisticMessage(conversation, body, key, ai, replyToMessageId),
      );
    },
    onSuccess: (result) => {
      reconcileCrmMessage(client, conversation.id, result.message);
      patchInboxMessage(client, result.message);
    },
    onError: (error, variables) => {
      const isKnownRejection = chatRequestFailure(error).status === "FAILED";
      if (isKnownRejection) markOptimisticCrmMessageFailed(client, conversation.id, variables.key);
      else {
        setUnknownSend(true);
        client.setQueryData<import("@tanstack/react-query").InfiniteData<import("@telegram-system/shared").CrmMessagesCursorPage>>(telegramCrmKeys.messagesInfinite(conversation.id), (data) => data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => item.clientIdempotencyKey === variables.key ? { ...item, deliveryState: "UNKNOWN" } : item) })) } : data);
      }
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const checkSend = useMutation({
    mutationFn: () => send.variables ? telegramCrmApi.getManualSendReceipt(conversation.id, send.variables.key) : Promise.resolve(null),
    onSuccess: (result) => {
      if (!result) return;
      reconcileCrmMessage(client, conversation.id, result.message);
      patchInboxMessage(client, result.message);
      setUnknownSend(false);
    },
  });
  const sendText = async (
    body: string,
    key: string,
    ai?: CrmCopilotSendApproval,
    replyToMessageId?: string,
  ) => {
    if (
      !query.isSuccess ||
      !body.trim() ||
      body.length > 4096 ||
      sending.current ||
      unknownSend
    )
      return false;
    sending.current = true;
    try {
      await send.mutateAsync({ body: body.trim(), key, ai, replyToMessageId });
      return true;
    } catch {
      return false;
    }
  };
  return {
    query,
    messages,
    send,
    unknownSend,
    checkSend,
    sendText,
    markRead,
    importHistory,
    refreshRecent,
    hasOlder: query.hasNextPage || !history.exhausted,
    loadOlder: async () => {
      if (loadingOlder.current || query.isFetchingNextPage || importHistory.isPending || refreshRecent.isPending) return;
      loadingOlder.current = true;
      try {
        if (query.hasNextPage) await query.fetchNextPage();
        else if (!history.exhausted) await importHistory.mutateAsync();
      } catch {
        // The mutation/query retains the error for the retryable thread state.
      } finally {
        loadingOlder.current = false;
      }
    },
  };
}
