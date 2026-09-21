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
} from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Copy, MoreHorizontal } from "lucide-react";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  appendCrmMessage,
  reconcileCrmConversationUnread,
  reconcileCrmMessage,
  markOptimisticCrmMessageFailed,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";

const MESSAGE_PAGE_SIZE = 50;
const INITIAL_HISTORY_IMPORT_SIZE = MESSAGE_PAGE_SIZE + 1;

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

function MessageRow({
  message,
  onRetry,
}: {
  message: CrmMessageListItem;
  onRetry?: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const outbound = message.direction === "OUTBOUND";
  const deliveryProblem =
    message.deliveryState === "FAILED" || message.deliveryState === "PENDING"
      ? message.deliveryState
      : null;
  return (
    <li className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div className="group relative max-w-[88%]">
        <div
          className={`rounded-xl border px-3 py-2 ${outbound ? "border-teal-800 bg-teal-950/45" : "border-neutral-800 bg-neutral-900"}`}
          onClick={() => setActionsOpen((open) => !open)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setActionsOpen((open) => !open);
            }
          }}
        >
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">
          {message.text || "Unsupported Telegram message"}
        </p>
        <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-neutral-500">
          <span>{formatDateTime(message.sentAt)}</span>
          {message.editedAt ? <span>Edited</span> : null}
          {deliveryProblem ? <span>{deliveryProblem}</span> : null}
        </div>
        {onRetry ? (
          <Button className="mt-2" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        </div>
        {actionsOpen ? (
          <div className={`absolute z-10 mt-1 flex min-w-32 gap-1 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-xl ${outbound ? "right-0" : "left-0"}`}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
              onClick={async (event) => {
                event.stopPropagation();
                await navigator.clipboard.writeText(message.text ?? "");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy size={13} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : null}
        <MoreHorizontal
          aria-hidden
          size={15}
          className={`pointer-events-none absolute -top-1 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 ${outbound ? "-left-5" : "-right-5"}`}
        />
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
  const initialScrollFor = useRef<string | null>(null);
  const [text, setText] = useState("");
  const [atHistoryBoundary, setAtHistoryBoundary] = useState(false);
  const [telegramHistoryExhausted, setTelegramHistoryExhausted] = useState(
    conversation.historyExhausted,
  );
  const [failed, setFailed] = useState<{ body: string; key: string } | null>(
    null,
  );
  const query = useInfiniteQuery({
    queryKey: telegramCrmKeys.messagesInfinite(conversation.id),
    queryFn: ({ pageParam, signal }) =>
      telegramCrmApi.listMessages(
        conversation.id,
        pageParam,
        MESSAGE_PAGE_SIZE,
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
    // Live events and mutations reconcile this cache. Keep a recently opened
    // thread in memory instead of repeating the same Neon read on every mount.
    staleTime: 60_000,
  });
  const messages = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => page.items) ?? [])
        .slice()
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [query.data],
  );
  const history = useMutation({
    mutationFn: () =>
      telegramCrmApi.importHistory(conversation.id, {
        limit: INITIAL_HISTORY_IMPORT_SIZE,
      }),
    onSuccess: async (result) => {
      setTelegramHistoryExhausted(result.exhausted);
      await queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.messagesInfinite(conversation.id),
      });
      await queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.conversationDetail(conversation.id),
      });
    },
  });
  useEffect(() => {
    if (!messages.length || initialScrollFor.current === conversation.id)
      return;
    initialScrollFor.current = conversation.id;
    requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (list) {
        list.scrollTop = list.scrollHeight;
        setAtHistoryBoundary(list.scrollTop <= 8);
      }
    });
  }, [conversation.id, messages.length]);
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
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.unread(),
      });
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
      markOptimisticCrmMessageFailed(
        queryClient,
        conversation.id,
        variables.key,
      );
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
    if (query.hasNextPage) await query.fetchNextPage();
    else if (!telegramHistoryExhausted) await history.mutateAsync();
    requestAnimationFrame(() => {
      if (list) list.scrollTop += list.scrollHeight - previousHeight;
      setAtHistoryBoundary(false);
    });
  };
  return (
    <section className="flex h-full min-h-0 flex-col">
      {(query.isSuccess && conversation.unreadCount > 0) || markRead.error ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          {query.isSuccess && conversation.unreadCount > 0 ? (
            <Button
              variant="secondary"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate()}
            >
              {markRead.isPending ? "Marking…" : "Mark read"}
            </Button>
          ) : null}
          {markRead.error ? (
            <span className="text-xs text-rose-300">
              Could not mark this conversation read. Try again.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-neutral-500">
              {crmText("states.loadingConversation")}
            </p>
          </div>
        ) : null}
        {query.error ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-2 text-sm text-rose-300">
              Conversation could not be loaded.
            </p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {history.isPending ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-neutral-500">
              Loading Telegram history…
            </p>
          </div>
        ) : null}
        {history.error ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-2 text-sm text-rose-300">
              Telegram history could not be loaded.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                history.mutate();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {!query.isLoading &&
        !query.error &&
        !history.isPending &&
        !history.error &&
        !messages.length ? (
          <div className="h-full">
            <EmptyState text={crmText("states.emptyConversation")} />
          </div>
        ) : null}
        {messages.length ? (
          <>
            {atHistoryBoundary &&
            (query.hasNextPage || !telegramHistoryExhausted) ? (
              <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
                <Button
                  variant="secondary"
                  disabled={query.isFetchingNextPage || history.isPending}
                  onClick={loadOlder}
                >
                  {query.isFetchingNextPage || history.isPending
                    ? "Loading…"
                    : "Load older"}
                </Button>
              </div>
            ) : null}
            <ol
              ref={messageListRef}
              onScroll={(event) =>
                setAtHistoryBoundary(event.currentTarget.scrollTop <= 8)
              }
              className="h-full space-y-2 overflow-y-auto pr-1 pt-2"
            >
              {messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  onRetry={
                    failed?.key === message.clientIdempotencyKey
                      ? () => send.mutate(failed)
                      : undefined
                  }
                />
              ))}
            </ol>
          </>
        ) : null}
      </div>
      {canSendManual ? (
        <div className="mt-3 shrink-0 border-t border-neutral-800 bg-neutral-950 pt-3">
          <TelegramTextEditor
            value={text}
            onChange={setText}
            disabled={send.isPending}
            rows={3}
            singleRowToolbar
            placeholder="Write a message…"
            characterCountLabel={(count) => `${count} characters`}
            enableCustomEmoji
          />
          <div className="mt-2 flex justify-end">
            <Button disabled={!text.trim() || send.isPending} onClick={submit}>
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
          {sendDisabledReason ||
            "You do not have permission to send manual CRM messages."}
        </p>
      )}
    </section>
  );
}
