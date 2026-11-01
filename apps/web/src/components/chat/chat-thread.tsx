"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/primitives";
import { MessageBubble } from "./message-bubble";
import type { ChatCapabilities, ChatMessage, ChatMessageActions } from "./types";

export function ChatThread({
  header,
  composer,
  messages,
  capabilities,
  actions,
  loading = false,
  error = false,
  onRetry,
  retryMessage,
  onLoadOlder,
  hasOlder = false,
  loadingOlder = false,
  emptyText = "No messages yet.",
  threadId,
  onNearBottomChange,
}: {
  header?: ReactNode;
  composer?: ReactNode;
  messages: ChatMessage[];
  capabilities: ChatCapabilities;
  actions?: ChatMessageActions;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  retryMessage?: (message: ChatMessage) => void;
  onLoadOlder?: () => void;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  emptyText?: string;
  threadId?: string;
  onNearBottomChange?: (nearBottom: boolean, visibleMessageIds: string[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const nearBottomRef = useRef(true);
  const reportedNearBottomRef = useRef<string | undefined>(undefined);
  const reportNearBottom = useCallback((nearBottom: boolean, element: HTMLDivElement | null) => {
    nearBottomRef.current = nearBottom;
    if (!onNearBottomChange) return;
    const visible: string[] = [];
    if (nearBottom && element) {
      const viewport = element.getBoundingClientRect();
      const left = Math.max(0, viewport.left);
      const right = Math.min(window.innerWidth, viewport.right);
      const top = Math.max(0, viewport.top);
      const bottom = Math.min(window.innerHeight, viewport.bottom);
      if (right > left && bottom > top) {
        const nodes = element.querySelectorAll<HTMLElement>("[data-message-id]");
        for (let index = nodes.length - 1; index >= 0; index--) {
          const node = nodes[index];
          const bubble = node.querySelector<HTMLElement>("article") ?? node;
          const bounds = bubble.getBoundingClientRect();
          if (visible.length && bounds.bottom <= top) break;
          const bubbleLeft = Math.max(left, bounds.left);
          const bubbleRight = Math.min(right, bounds.right);
          const bubbleTop = Math.max(top, bounds.top);
          const bubbleBottom = Math.min(bottom, bounds.bottom);
          if (bubbleRight <= bubbleLeft || bubbleBottom <= bubbleTop) continue;
          const hit = typeof document.elementFromPoint === "function"
            ? document.elementFromPoint((bubbleLeft + bubbleRight) / 2, (bubbleTop + bubbleBottom) / 2)
            : bubble;
          if (hit && (hit === bubble || bubble.contains(hit)) && node.dataset.messageId)
            visible.push(node.dataset.messageId);
        }
      }
    }
    const signature = JSON.stringify([nearBottom, visible]);
    if (reportedNearBottomRef.current === signature) return;
    reportedNearBottomRef.current = signature;
    onNearBottomChange(nearBottom, visible);
  }, [onNearBottomChange]);
  const previousRef = useRef({ threadId, firstId: "", lastId: "", height: 0 });
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !messages.length) { reportNearBottom(false, element); return; }
    const previous = previousRef.current;
    const firstId = messages[0].id;
    const last = messages[messages.length - 1];
    const changedThread = previous.threadId !== threadId;
    if (changedThread || !previous.lastId || (previous.lastId !== last.id && (nearBottomRef.current || last.direction === "outgoing"))) {
      element.scrollTop = element.scrollHeight;
    } else if (previous.firstId !== firstId && previous.lastId === last.id) {
      element.scrollTop += Math.max(0, element.scrollHeight - previous.height);
    }
    previousRef.current = { threadId, firstId, lastId: last.id, height: element.scrollHeight };
    reportNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80, element);
  }, [messages, threadId, reportNearBottom]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {header ? <header className="shrink-0 border-b border-neutral-800 bg-neutral-900/95 px-3 py-2 md:px-4">{header}</header> : null}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Message history"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          reportNearBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80, element);
        }}
        className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 md:px-5"
      >
        {hasOlder && onLoadOlder ? <div className="mb-4 text-center"><Button variant="secondary" disabled={loadingOlder} onClick={onLoadOlder}>{loadingOlder ? "Loading…" : "Load older messages"}</Button></div> : null}
        {loading && !messages.length ? <p role="status" className="py-12 text-center text-sm text-neutral-400">Loading messages…</p> : null}
        {error ? <div role="alert" className="space-y-3 py-6 text-center text-sm text-rose-300"><p>Messages could not be loaded.</p>{onRetry ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : null}</div> : null}
        {!loading && !error && !messages.length ? <p role="status" className="py-12 text-center text-sm text-neutral-400">{emptyText}</p> : null}
        <ol aria-label="Messages" className="space-y-3">
          {messages.map((message, index) => {
            const actionId = `${threadId ?? ""}:${message.id}`;
            const day = new Date(message.sentAt);
            const previous = index > 0 ? new Date(messages[index - 1].sentAt) : null;
            const showDay = !Number.isNaN(day.getTime()) && (!previous || Number.isNaN(previous.getTime()) || day.toDateString() !== previous.toDateString());
            return (
              <Fragment key={message.id}>
              {showDay ? <li className="py-2 text-center text-xs text-neutral-400"><time dateTime={message.sentAt}>{day.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</time></li> : null}
              <MessageBubble
                message={message}
                capabilities={capabilities}
                actions={{ ...actions, onJumpToReply: (id) => {
                  const original = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>("[data-message-id]") ?? []).find((item) => item.dataset.messageId === id);
                  if (original) { original.scrollIntoView({ block: "center", behavior: "smooth" }); original.tabIndex = -1; original.focus({ preventScroll: true }); }
                  else actions?.onJumpToReply?.(id);
                } }}
                actionsOpen={activeActionsId === actionId}
                onActionsOpenChange={(open) => setActiveActionsId((current) => open ? actionId : current === actionId ? null : current)}
                onRetry={capabilities.canSend && message.status === "failed" && retryMessage ? () => retryMessage(message) : undefined}
              />
              </Fragment>
            );
          })}
        </ol>
      </div>
      {composer}
    </div>
  );
}
