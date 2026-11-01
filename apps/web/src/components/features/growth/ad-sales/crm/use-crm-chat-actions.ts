"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmChatActionRequest, CrmChatActionResult } from "@telegram-system/shared";
import { crmChatActionsApi, chatOperationId, chatRequestFailure } from "@/lib/features/growth/crm-chat-actions-api";
import { reconcileCrmMessage, telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { patchInboxMessage } from "@/lib/features/growth/crm-inbox-cache";
import { patchDeletedChatMessages, patchEditedInboxMessage, reconcileDeletedInboxHeads } from "@/lib/features/growth/crm-chat-cache";

export function useCrmChatActions(conversationId: string, canSend: boolean) {
  const client = useQueryClient();
  const busy = useRef(false);
  const currentKind = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<CrmChatActionResult | null>(null);
  const capabilities = useQuery({ queryKey: telegramCrmKeys.chatCapabilities(conversationId), queryFn: ({ signal }) => crmChatActionsApi.capabilities(conversationId, signal), staleTime: 60_000 });
  const apply = (result: CrmChatActionResult, kind?: string) => {
    setReceipt(result);
    if (result.status !== "CONFIRMED") return;
    if (result.message) {
      reconcileCrmMessage(client, result.message.conversationId, result.message);
      if (kind === "FORWARD" || kind === "MEDIA") patchInboxMessage(client, result.message);
      else patchEditedInboxMessage(client, result.message);
    }
    if (result.deletedMessageIds?.length) {
      patchDeletedChatMessages(client, result.conversationId, result.deletedMessageIds);
      reconcileDeletedInboxHeads(client);
      // Returned action receipt may not contain unread/last-message compacts.
      void client.invalidateQueries({ queryKey: telegramCrmKeys.conversationDetail(result.conversationId), exact: true });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.unread(), exact: true });
    }
  };
  const run = async (operationId: string, task: () => Promise<CrmChatActionResult>, kind?: string) => {
    if (busy.current || receipt?.status === "UNKNOWN") return false;
    busy.current = true; currentKind.current = kind; setPending(true);
    try { const result = await task(); apply(result, kind); return result.status === "CONFIRMED"; }
    catch (error) { setReceipt({ operationId, conversationId, ...chatRequestFailure(error) }); return false; }
    finally { busy.current = false; setPending(false); }
  };
  return {
    capabilities: capabilities.data,
    pending,
    blocked: pending || receipt?.status === "UNKNOWN",
    receipt,
    dismiss: () => { if (receipt?.status !== "UNKNOWN") setReceipt(null); },
    execute: (body: Omit<CrmChatActionRequest, "operationId">) => {
      if (!canSend) return Promise.resolve(false);
      const request = { ...body, operationId: chatOperationId() };
      return run(request.operationId, () => crmChatActionsApi.execute(conversationId, request), request.kind);
    },
    upload: (body: FormData, signal: AbortSignal) => {
      if (!canSend) return Promise.resolve(false);
      const id = chatOperationId(); body.set("operationId", id);
      return run(id, () => crmChatActionsApi.upload(conversationId, body, signal), "MEDIA");
    },
    check: async () => {
      if (!receipt || busy.current) return;
      busy.current = true; setPending(true);
      try { apply(await crmChatActionsApi.check(conversationId, receipt.operationId), currentKind.current); }
      catch { /* Keep uncertainty; checking cannot authorize a second provider send. */ }
      finally { busy.current = false; setPending(false); }
    },
  };
}
