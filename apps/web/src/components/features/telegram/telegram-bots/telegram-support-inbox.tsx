"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, Headphones, Send } from "lucide-react";
import type {
  SupportBotView,
  SupportProduct,
  SupportTicket,
} from "@telegram-system/shared";
import { Button, Card, Select } from "@/components/ui/primitives";
import { WORKSPACE_CHANGE_EVENT } from "@/providers/notification-navigation-coordinator";
import {
  supportKeys,
  telegramSupportApi,
  watchSupport,
} from "@/lib/features/telegram/telegram-support-api";

export const supportNames: Record<SupportProduct, string> = {
  NEXELOQ: "Nexeloq",
  GROSHLY: "Groshly",
};

export function useTelegramSupport() {
  const client = useQueryClient();
  const summary = useQuery({
    queryKey: supportKeys.summary,
    queryFn: telegramSupportApi.summary,
    retry: false,
  });
  const enabled = Boolean(summary.data?.some((bot) => bot.configured));
  useEffect(() => {
    if (!enabled) return;
    let stream: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    function stop() {
      stream?.abort();
      clearTimeout(retry);
    }
    function start(attempt: number) {
      if (document.hidden) return;
      const current = new AbortController();
      stream = current;
      void watchSupport(current.signal, () => {
        void client.invalidateQueries({ queryKey: supportKeys.root });
      })
        .catch(() => undefined)
        .finally(() => {
          if (!current.signal.aborted && !document.hidden && attempt < 3)
            retry = setTimeout(() => start(attempt + 1), 1000 * 2 ** attempt);
        });
    }
    const connect = () => {
      stop();
      start(0);
    };
    document.addEventListener("visibilitychange", connect);
    window.addEventListener("focus", connect);
    window.addEventListener(WORKSPACE_CHANGE_EVENT, connect);
    connect();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", connect);
      window.removeEventListener("focus", connect);
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, connect);
    };
  }, [client, enabled]);
  return summary;
}

export function SupportCardLink({
  bot,
  onOpen,
}: {
  bot?: SupportBotView;
  onOpen: () => void;
}) {
  return (
    <Button variant="secondary" onClick={onOpen}>
      <span className="inline-flex items-center gap-2">
        <Headphones size={16} />
        Support
        {bot && (
          <span
            className={
              bot.needsReply
                ? "font-semibold text-amber-300"
                : "text-neutral-400"
            }
          >
            {bot.open}
          </span>
        )}
      </span>
    </Button>
  );
}

export function TelegramSupportInbox({
  product,
  onProduct,
  bots,
}: {
  product?: SupportProduct;
  onProduct: (product?: SupportProduct) => void;
  bots: SupportBotView[];
}) {
  const [closed, setClosed] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const list = useInfiniteQuery({
    queryKey: supportKeys.list(closed, product),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      telegramSupportApi.list(closed, product, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const tickets = list.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = tickets.find((ticket) => ticket.id === selectedId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={closed ? "secondary" : undefined}
          onClick={() => {
            setClosed(false);
            setSelectedId(undefined);
          }}
        >
          Open
        </Button>
        <Button
          variant={closed ? undefined : "secondary"}
          onClick={() => {
            setClosed(true);
            setSelectedId(undefined);
          }}
        >
          Closed
        </Button>
        <Select
          aria-label="Application"
          value={product ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onProduct(
              value === "GROSHLY" || value === "NEXELOQ" ? value : undefined,
            );
            setSelectedId(undefined);
          }}
        >
          <option value="">All applications</option>
          <option value="NEXELOQ">Nexeloq</option>
          <option value="GROSHLY">Groshly</option>
        </Select>
      </div>
      {product && (
        <Card className="text-sm text-neutral-300">
          <p className="font-semibold">{supportNames[product]} support bot</p>
          <p>
            {bots.find((bot) => bot.product === product)?.configured
              ? `@${bots.find((bot) => bot.product === product)?.username} · Configured in environment`
              : product === "GROSHLY"
                ? "Set FINANCE_BOT_SUPPORT_TOKEN and FINANCE_BOT_SUPPORT_USERNAME in the Finance environment."
                : "Set TELEGRAM_SYSTEM_BOT_SUPPORT_TOKEN and TELEGRAM_SYSTEM_BOT_SUPPORT_USERNAME in the root environment."}
          </p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(275px,1fr)_minmax(0,2fr)]">
        <Card className="space-y-2" aria-label="Support tickets">
          {list.isPending && <p role="status">Loading tickets…</p>}
          {list.isError && (
            <div role="alert">
              <p>Could not load support tickets.</p>
              <Button onClick={() => void list.refetch()}>Retry</Button>
            </div>
          )}
          {!list.isPending && !list.isError && tickets.length === 0 && (
            <p className="text-sm text-neutral-400">
              No {closed ? "closed" : "open"} tickets.
            </p>
          )}
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              className={`block w-full rounded-lg border p-3 text-left ${selectedId === ticket.id ? "border-blue-500 bg-blue-950/40" : "border-neutral-800 hover:bg-neutral-800"}`}
              aria-pressed={selectedId === ticket.id}
              onClick={() => setSelectedId(ticket.id)}
            >
              <span className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                {supportNames[ticket.product]}{" "}
                {ticket.needsReply && (
                  <span className="text-amber-300">Needs reply</span>
                )}
              </span>
              <span className="block truncate font-semibold">
                {ticket.senderName}
              </span>
              <span className="block truncate text-sm text-neutral-400">
                {ticket.preview}
              </span>
            </button>
          ))}
          {list.hasNextPage && (
            <Button
              variant="secondary"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              More tickets
            </Button>
          )}
        </Card>
        {selected ? (
          <SupportThread key={selected.id} ticket={selected} />
        ) : (
          <Card className="text-sm text-neutral-400">
            Select a ticket to view the conversation.
          </Card>
        )}
      </div>
    </div>
  );
}

function SupportThread({ ticket }: { ticket: SupportTicket }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const request = useRef<{ id: string; text: string } | null>(null);
  const thread = useInfiniteQuery({
    queryKey: supportKeys.thread(ticket.id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => telegramSupportApi.thread(ticket.id, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const invalidate = () =>
    client.invalidateQueries({ queryKey: supportKeys.root });
  const reply = useMutation({
    mutationFn: (input: { id: string; text: string }) =>
      telegramSupportApi.reply(ticket.id, input.id, input.text),
    onSuccess: async () => {
      setText("");
      request.current = null;
      await invalidate();
    },
  });
  const close = useMutation({
    mutationFn: () => telegramSupportApi.close(ticket.id),
    onSuccess: invalidate,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    if (!message || reply.isPending || close.isPending) return;
    const operation =
      request.current?.text === message
        ? request.current
        : { id: crypto.randomUUID(), text: message };
    request.current = operation;
    reply.mutate(operation);
  }
  const messages = (
    thread.data?.pages.flatMap((page) => page.items) ?? []
  ).toReversed();
  return (
    <Card className="space-y-4" aria-label="Support conversation">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{ticket.senderName}</strong>
          <p className="text-sm text-neutral-400">
            {supportNames[ticket.product]}
            {ticket.username ? ` · @${ticket.username}` : ""}
          </p>
        </div>
        {!ticket.closedAt && (
          <Button
            variant="secondary"
            disabled={close.isPending || reply.isPending}
            onClick={() => close.mutate()}
          >
            <Check size={16} /> Close ticket
          </Button>
        )}
      </header>
      {close.isError && (
        <p role="alert" className="text-red-300">
          Could not close this ticket.
        </p>
      )}
      {thread.hasNextPage && (
        <Button
          variant="secondary"
          disabled={thread.isFetchingNextPage}
          onClick={() => void thread.fetchNextPage()}
        >
          Older messages
        </Button>
      )}
      {thread.isError && <p role="alert">Could not load the conversation.</p>}
      {thread.isPending && <p role="status">Loading messages…</p>}
      <div
        className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto"
        role="log"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[90%] rounded-xl p-3 ${message.status === "INBOUND" ? "self-start bg-neutral-800" : "self-end bg-blue-950/80"}`}
          >
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.text}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {new Date(message.createdAt).toLocaleString()}
              {message.status === "UNKNOWN"
                ? " · Delivery unconfirmed"
                : message.status === "SENDING"
                  ? " · Sending"
                  : ""}
            </p>
          </div>
        ))}
      </div>
      {!ticket.closedAt && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            aria-label="Reply"
            placeholder="Reply via Telegram"
            maxLength={4096}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={reply.isPending}
            className="min-h-24 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3"
          />
          <Button
            type="submit"
            disabled={!text.trim() || reply.isPending || close.isPending}
          >
            <Send size={16} /> Send reply
          </Button>
          {reply.isError && (
            <p role="alert" className="text-red-300">
              Could not confirm the reply. Retry to check the same send.
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
