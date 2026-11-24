"use client";

import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Archive, Inbox, LayoutGrid } from "lucide-react";
import type {
  SupportBotView,
  SupportProduct,
  SupportTicket,
} from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { WORKSPACE_CHANGE_EVENT } from "@/providers/notification-navigation-coordinator";
import {
  supportKeys,
  telegramSupportApi,
  watchSupport,
} from "@/lib/features/telegram/telegram-support-api";

import { ChatShell } from "@/components/chat/chat-shell";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { SupportParticipantAvatar } from "./support-participant-avatar";
import { SupportThread } from "./telegram-support-thread";

export const supportNames: Record<SupportProduct, string> = {
  NEXELOQ: "Nexeloq",
  GROSHLY: "Groshly",
};

const productIcons: Record<SupportProduct, string> = {
  NEXELOQ: "/brand/nexeloq-pwa-192.png",
  GROSHLY: "/brand/groshly-icon.png",
};

export function SupportProductBadge({ product, ticket }: { product: SupportProduct; ticket?: SupportTicket }) {
  const icon = { type: "image" as const, id: product, url: productIcons[product], name: supportNames[product] };
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-xs font-semibold text-neutral-100">
      {ticket
        ? <SupportParticipantAvatar ticket={ticket} kind="bot" label={supportNames[product]} size="xs" fallback={icon} />
        : <IconAvatar icon={icon} decorative bordered={false} size="xs" />}
      {supportNames[product]}
    </span>
  );
}

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

export function BotSupportPanel({ bot }: { bot?: SupportBotView }) {
  if (!bot) return null;
  return (
    <p className="mt-3 text-xs text-neutral-400">
      {bot.open} open · {bot.needsReply} awaiting reply
    </p>
  );
}

export function TelegramSupportInbox({
  product,
  onProduct,
}: {
  product?: SupportProduct;
  onProduct: (product?: SupportProduct) => void;
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
          aria-pressed={!closed}
          onClick={() => {
            setClosed(false);
            setSelectedId(undefined);
          }}
        >
          <Inbox aria-hidden="true" /> Open
        </Button>
        <Button
          variant={closed ? undefined : "secondary"}
          aria-pressed={closed}
          onClick={() => {
            setClosed(true);
            setSelectedId(undefined);
          }}
        >
          <Archive aria-hidden="true" /> Closed
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Application">
        {([undefined, "NEXELOQ", "GROSHLY"] as const).map((option) => (
          <button
            key={option ?? "all"}
            type="button"
            aria-pressed={product === option}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 aria-pressed:border-amber-500/70 aria-pressed:bg-amber-400/10"
            onClick={() => {
              onProduct(option);
              setSelectedId(undefined);
            }}
          >
            {option ? <SupportProductBadge product={option} /> : <><LayoutGrid size={16} aria-hidden /> All applications</>}
          </button>
        ))}
      </div>
      <div className="h-[max(30rem,calc(100dvh-17rem))] min-w-0">
        <ChatShell
          selected={Boolean(selected)}
          list={
            <div className="app-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-label="Support tickets">
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
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg border px-2.5 py-2 text-left ${selectedId === ticket.id ? "border-blue-500 bg-blue-950/40" : "border-neutral-800 hover:bg-neutral-800"}`}
                  aria-pressed={selectedId === ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <SupportProductBadge product={ticket.product} />
                    <span className="flex min-w-0 items-center gap-1.5 text-sm">
                      <SupportParticipantAvatar ticket={ticket} kind="sender" label={ticket.senderName} size="xs" lazy />
                      <span className="max-w-[55%] shrink-0 truncate font-semibold">{ticket.senderName}</span>
                      {ticket.preview && <span className="min-w-0 truncate text-neutral-400" title={ticket.preview}>· {ticket.preview}</span>}
                    </span>
                  </span>
                  {ticket.needsReply && <span className="whitespace-nowrap text-xs text-amber-300">Needs reply</span>}
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
            </div>
          }
          thread={selected ? (
            <SupportThread
              key={`${selected.workspaceId}:${selected.id}`}
              ticket={selected}
              productBadge={<SupportProductBadge product={selected.product} ticket={selected} />}
              onBack={() => setSelectedId(undefined)}
              onReopen={(id) => {
                setClosed(false);
                setSelectedId(id);
              }}
            />
          ) : (
            <p className="m-auto p-4 text-sm text-neutral-400">Select a ticket to view the conversation.</p>
          )}
        />
      </div>
    </div>
  );
}
