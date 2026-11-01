"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CrmConversationListItem, CrmRealtimeEvent, CrmSalesWorkflow, CrmUnreadSummary } from "@telegram-system/shared";
import { listCrmInboxConversations, type CrmInboxConversationParams } from "./crm-inbox-api";
import { findInboxConversation, mergeInboxFirstPage, patchInboxConversation, patchInboxMessage, type CrmInboxData } from "./crm-inbox-cache";
import { patchDeletedChatMessages, patchEditedInboxMessage } from "./crm-chat-cache";
import { patchInboxContactSales } from "./crm-sales-workflow-cache";
import { reconcileCrmConversationUnread, reconcileCrmMessage, telegramCrmKeys } from "./telegram-crm-query";
import { useTelegramCrmRealtime } from "./use-telegram-crm-realtime";

export function useCrmInboxRealtime(workspaceId: string | undefined, active: boolean) {
  const client = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const folderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    refreshController.current?.abort();
    if (folderTimer.current) clearTimeout(folderTimer.current);
    folderTimer.current = null;
  }, [workspaceId, active]);

  const reconcileFolders = () => {
    if (folderTimer.current) return;
    folderTimer.current = setTimeout(() => {
      folderTimer.current = null;
      void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxFolders(), exact: true, refetchType: "active" });
    }, 250);
  };

  const reconcileLists = () => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      refreshController.current?.abort();
      const controller = new AbortController();
      refreshController.current = controller;
      void client.invalidateQueries({ queryKey: telegramCrmKeys.unread(), refetchType: "active" });
      for (const query of client.getQueryCache().findAll({ queryKey: telegramCrmKeys.inboxConversations(), type: "active" })) {
        const params = query.queryKey[2] as CrmInboxConversationParams;
        void listCrmInboxConversations(params, null, controller.signal).then((page) => {
          if (controller.signal.aborted) return;
          client.setQueryData<CrmInboxData>(query.queryKey, (current) => mergeInboxFirstPage(current, page));
        }).catch(() => { /* Preserve the visible list; reconnect/manual retry can reconcile. */ });
      }
    }, 250);
  };

  const reconcileVisibleLists = () => {
    const activeFolder = client.getQueryCache().findAll({ queryKey: telegramCrmKeys.inboxConversations(), type: "active" })
      .some((query) => Boolean((query.queryKey[2] as CrmInboxConversationParams | undefined)?.folderId));
    if (!activeFolder) return reconcileLists();
    void client.invalidateQueries({ queryKey: telegramCrmKeys.unread(), refetchType: "active" });
    // A folder sync can remove rows as well as add them. Refetch loaded
    // pages rather than merging a new head with now-obsolete members.
    void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxConversations(), refetchType: "active",
      predicate: (query) => Boolean((query.queryKey[2] as CrmInboxConversationParams | undefined)?.folderId) });
  };

  return useTelegramCrmRealtime({
    scopeKey: workspaceId,
    active: active && Boolean(workspaceId),
    onEvent: (event: CrmRealtimeEvent) => {
      if (event.workspaceId !== workspaceId) return;
      if (event.type === "message.received" || event.type === "message.deleted" || event.type === "readChanged" ||
          event.type === "conversation.unreadChanged" || event.type === "inbox.updated" || event.type === "contact.updated" ||
          event.type === "folders.updated" ||
          (event.type === "sync.progress" && (event.phase === "COMPLETED" || event.phase === "FAILED"))) reconcileFolders();
      if (event.type === "folders.updated" || (event.type === "sync.progress" && (event.phase === "COMPLETED" || event.phase === "FAILED"))) reconcileVisibleLists();
      if (event.type === "message.received" || event.type === "message.sent" || event.type === "message.updated") {
        // Only patch existing history; an unopened thread still fetches its first cursor page.
        reconcileCrmMessage(client, event.conversationId, event.message);
        if (event.type === "message.updated") patchEditedInboxMessage(client, event.message);
        else if (!patchInboxMessage(client, event.message)) reconcileLists();
        const updated = findInboxConversation(client, event.conversationId);
        if (updated) client.setQueryData<CrmSalesWorkflow>(telegramCrmKeys.salesWorkflow(event.conversationId), (workflow) =>
          workflow ? { ...workflow, attentionStatus: updated.attentionStatus ?? null } : workflow);
      } else if (event.type === "message.deleted") {
        patchDeletedChatMessages(client, event.conversationId, event.messageIds);
        const previous = findInboxConversation(client, event.conversationId)?.unreadCount;
        reconcileCrmConversationUnread(client, event.conversationId, event.contactId, event.unreadCount, previous);
        patchInboxConversation(client, event.conversationId, { unreadCount: event.unreadCount, readState: event.unreadCount ? "UNREAD" : "READ", lastMessage: event.lastMessage ?? null, lastMessageAt: event.lastMessageAt });
        void client.invalidateQueries({ queryKey: telegramCrmKeys.unread(), exact: true });
      } else if (event.type === "readChanged" || event.type === "conversation.unreadChanged") {
        // Read events can also advance the recipient's outgoing read watermark.
        // Refresh only the open thread; inactive histories are marked stale.
        if (event.type === "readChanged") {
          void client.invalidateQueries({ queryKey: telegramCrmKeys.messagesInfinite(event.conversationId), exact: true, refetchType: "active" });
          void client.invalidateQueries({ queryKey: telegramCrmKeys.conversationDetail(event.conversationId), exact: true, refetchType: "active" });
        }
        const previous = findInboxConversation(client, event.conversationId)?.unreadCount ??
          client.getQueryData<CrmConversationListItem>(telegramCrmKeys.conversationDetail(event.conversationId))?.unreadCount;
        reconcileCrmConversationUnread(client, event.conversationId, event.contactId, event.unreadCount, previous);
        patchInboxConversation(client, event.conversationId, { unreadCount: event.unreadCount,
          readState: event.unreadCount ? "UNREAD" : "READ" });
        if (previous !== undefined) client.setQueryData<CrmUnreadSummary>(telegramCrmKeys.unread(), (summary) => {
          if (!summary) return summary;
          const delta = event.unreadCount - previous;
          const bucket = event.contactId ? "contacts" : "inbox";
          return { ...summary, total: Math.max(0, summary.total + delta), [bucket]: Math.max(0, summary[bucket] + delta) };
        });
        else reconcileLists();
      } else if (event.type === "inbox.updated" && event.conversation) {
        const current = findInboxConversation(client, event.conversation.id);
        if (current) patchInboxConversation(client, event.conversation.id, { state: event.conversation.state });
      } else if (event.type === "contact.updated") {
        const facts = { ...(event.manualSalesStatus !== undefined ? { manualSalesStatus: event.manualSalesStatus } : {}),
          ...(event.nextContactAt !== undefined ? { nextContactAt: event.nextContactAt } : {}),
          ...(event.archivedAt !== undefined ? { archivedAt: event.archivedAt } : {}) };
        if (Object.keys(facts).length) {
          patchInboxContactSales(client, event.contactId, facts);
          for (const [key, workflow] of client.getQueriesData<CrmSalesWorkflow>({ queryKey: telegramCrmKeys.salesWorkflows() })) {
            if (workflow?.contactId !== event.contactId) continue;
            void client.invalidateQueries({ queryKey: key, exact: true, refetchType: "active" });
          }
        }
        void client.invalidateQueries({ queryKey: telegramCrmKeys.contactDetail(event.contactId), refetchType: "none" });
        void client.invalidateQueries({ queryKey: telegramCrmKeys.contactLists(), refetchType: "none" });
      }
    },
    onReconnect: () => {
      reconcileVisibleLists();
      reconcileFolders();
      void client.invalidateQueries({ queryKey: telegramCrmKeys.salesWorkflows(), refetchType: "active" });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.messages(), refetchType: "active" });
    },
  });
}
