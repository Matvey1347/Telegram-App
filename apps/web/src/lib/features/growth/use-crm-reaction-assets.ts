"use client";

import { useQueries } from "@tanstack/react-query";
import type { CrmMessageListItem, ResolvedEmoji } from "@telegram-system/shared";
import { crmChatActionsApi } from "./crm-chat-actions-api";
import { telegramCrmKeys } from "./telegram-crm-query";

/** One bounded request per group of messages containing custom reactions. */
export function useCrmReactionAssets(workspaceId: string, conversationId: string, messages: CrmMessageListItem[]) {
  const candidates = messages.flatMap((message) => {
    const reactions = message.contentMetadata?.reactions;
    if (!Array.isArray(reactions)) return [];
    const ids = reactions.flatMap((reaction) => typeof reaction?.emoji === "string" && /^custom:\d+$/.test(reaction.emoji) ? [reaction.emoji.slice(7)] : []);
    return ids.length ? [{ id: message.id, fingerprint: ids.sort().join(",") }] : [];
  });
  const pages = Array.from({ length: Math.ceil(candidates.length / 50) }, (_, index) => candidates.slice(index * 50, index * 50 + 50));
  const groups = pages.flatMap((page) => {
    const documents = [...new Set(page.flatMap((entry) => entry.fingerprint.split(",")))].sort();
    return Array.from({ length: Math.ceil(documents.length / 5) }, (_, index) => ({
      messageIds: page.map((entry) => entry.id),
      documentIds: documents.slice(index * 5, index * 5 + 5),
    }));
  });
  const results = useQueries({ queries: groups.map((group) => ({
    queryKey: telegramCrmKeys.reactionAssets(workspaceId, conversationId, JSON.stringify(group)),
    queryFn: ({ signal }: { signal: AbortSignal }) => crmChatActionsApi.reactionAssets(conversationId, group.messageIds, group.documentIds, signal),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  })) });
  return Object.assign({} as Record<string, ResolvedEmoji>, ...results.map((result) => result.data?.items ?? {}));
}
