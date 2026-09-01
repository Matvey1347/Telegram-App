"use client";

import { useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CrmConversationListItem,
  CrmMessageListItem,
} from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import { Button, EmptyState, Textarea } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  appendCrmMessage,
  reconcileCrmConversationUnread,
  reconcileCrmMessage,
  markOptimisticCrmMessageFailed,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";
import { crmMessageOriginLabel } from "./crm-message-presentation";

function optimisticMessage(
  conversation: CrmConversationListItem,
  text: string,
  clientIdempotencyKey: string,
): CrmMessageListItem {
  const sentAt = new Date().toISOString();
  return {
    id: `optimistic:${clientIdempotencyKey}`,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    telegramMessageId: `pending:${clientIdempotencyKey}`,
    telegramMessageIdNumeric: null,
    clientIdempotencyKey,
    mtprotoAccountId: conversation.mtprotoAccountId,
    direction: "OUTBOUND",
    origin: "MANUAL",
    sentByMemberId: null,
    automationExecutionId: null,
    text,
    contentMetadata: null,
    sentAt,
    editedAt: null,
    readState: "UNKNOWN",
    deliveryState: "PENDING",
    createdAt: sentAt,
    account: conversation.account,
    sentByMember: null,
  };
}

function MessageRow({ message, onRetry }: { message: CrmMessageListItem; onRetry?: () => void }) {
  const outbound = message.direction === "OUTBOUND";
  const origin = crmMessageOriginLabel(message);
  return (
    <li className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-xl border px-3 py-2 ${outbound ? "border-teal-800 bg-teal-950/45" : "border-neutral-800 bg-neutral-900"}`}>
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
          <span>{outbound ? "Outgoing" : "Incoming"}</span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5">{origin}</span>
          <span>via {message.account.username ? `@${message.account.username}` : message.account.label}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">{message.text || "Unsupported Telegram message"}</p>
        <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-neutral-500">
          <span>{formatDateTime(message.sentAt)}</span>
          {message.editedAt ? <span>Edited</span> : null}
          {outbound ? <span>{message.deliveryState}</span> : null}
          <span>{message.readState}</span>
        </div>
        {onRetry ? <Button className="mt-2" variant="secondary" onClick={onRetry}>Retry</Button> : null}
      </div>
    </li>
  );
}

export function CrmMessageThread({
  conversation,
  canSendManual,
  sendDisabledReason,
}: {
  conversation: CrmConversationListItem;
  canSendManual: boolean;
  sendDisabledReason?: string;
}) {
  const queryClient = useQueryClient();
  const messageListRef = useRef<HTMLOListElement>(null);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<{ body: string; key: string } | null>(null);
  const query = useInfiniteQuery({
    queryKey: telegramCrmKeys.messagesInfinite(conversation.id),
    queryFn: ({ pageParam, signal }) =>
      telegramCrmApi.listMessages(conversation.id, pageParam, 50, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
  });
  const messages = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => page.items) ?? [])
        .slice()
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [query.data],
  );
  const markRead = useMutation({
    mutationFn: () => telegramCrmApi.markConversationRead(conversation.id),
    onSuccess: () => {
      reconcileCrmConversationUnread(
        queryClient,
        conversation.id,
        conversation.contactId,
        0,
        conversation.unreadCount,
      );
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() });
    },
  });
  const send = useMutation({
    mutationFn: ({ body, key }: { body: string; key: string }) =>
      telegramCrmApi.sendManualMessage(conversation.id, {
        text: body,
        clientIdempotencyKey: key,
      }),
    onMutate: ({ body, key }) => {
      appendCrmMessage(
        queryClient,
        conversation.id,
        optimisticMessage(conversation, body, key),
      );
    },
    onSuccess: (result) => {
      setFailed(null);
      reconcileCrmMessage(queryClient, conversation.id, {
        ...result.message,
        account: conversation.account,
      });
    },
    onError: (_error, variables) => {
      markOptimisticCrmMessageFailed(queryClient, conversation.id, variables.key);
      setFailed(variables);
    },
  });
  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    const key = crypto.randomUUID();
    setText("");
    send.mutate({ body, key });
  };
  const loadOlder = async () => {
    const list = messageListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    await query.fetchNextPage();
    requestAnimationFrame(() => {
      if (list) list.scrollTop += list.scrollHeight - previousHeight;
    });
  };
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-3">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div>
          <h3 className="font-medium text-white">via {conversation.account.username ? `@${conversation.account.username}` : conversation.account.label}</h3>
          <p className="text-xs text-neutral-500">Replies stay on this Telegram account.</p>
        </div>
        {query.isSuccess && conversation.unreadCount > 0 ? (
          <Button variant="secondary" disabled={markRead.isPending} onClick={() => markRead.mutate()}>
            {markRead.isPending ? "Marking…" : "Mark read"}
          </Button>
        ) : null}
        {markRead.error ? <span className="text-xs text-rose-300">Could not mark this conversation read. Try again.</span> : null}
      </header>
      {query.hasNextPage ? <Button variant="secondary" disabled={query.isFetchingNextPage} onClick={loadOlder}>Load older</Button> : null}
      {query.isLoading ? <p className="py-8 text-center text-sm text-neutral-500">{crmText("states.loadingConversation")}</p> : null}
      {query.error ? <div className="py-5 text-center"><p className="mb-2 text-sm text-rose-300">Conversation could not be loaded.</p><Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></div> : null}
      {!query.isLoading && !query.error && !messages.length ? <EmptyState text={crmText("states.emptyConversation")} /> : null}
      {messages.length ? <ol ref={messageListRef} className="my-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">{messages.map((message) => <MessageRow key={message.id} message={message} onRetry={failed?.key === message.clientIdempotencyKey ? () => send.mutate(failed) : undefined} />)}</ol> : null}
      {canSendManual ? (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={`Reply via ${conversation.account.username ? `@${conversation.account.username}` : conversation.account.label}`} aria-label="Manual Telegram message" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-500">Manual messages work even when customer automation is OFF.</span>
            <Button disabled={!text.trim() || send.isPending} onClick={submit}>{send.isPending ? "Sending…" : "Send"}</Button>
          </div>
        </div>
      ) : <p className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">{sendDisabledReason || "You do not have permission to send manual CRM messages."}</p>}
    </section>
  );
}
