"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button } from "@/components/ui/primitives";
import type { ChatConversation } from "./types";

const ROW_HEIGHT = 88;
const OVERSCAN = 4;
const INITIAL_HEIGHT = 640;

function activityTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** A bounded DOM window keeps long server-paginated lists cheap to render. */
export function ConversationList({
  items,
  selectedId,
  onSelect,
  onContextMenu,
  emptyText = "No conversations found.",
  loading = false,
  error = false,
  onRetry,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: {
  items: ChatConversation[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onContextMenu?: (id: string) => void;
  emptyText?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [viewport, setViewport] = useState({ top: 0, height: INITIAL_HEIGHT });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const requestingMore = useRef(false);
  useEffect(() => { if (!loadingMore) requestingMore.current = false; }, [loadingMore, items.length]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === (focusedId ?? selectedId)),
  );
  const start = Math.max(0, Math.min(items.length - 1, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN));
  const end = Math.min(
    items.length,
    Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN,
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setViewport({ top: element.scrollTop, height: element.clientHeight || INITIAL_HEIGHT });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      if (onContextMenu) { event.preventDefault(); onContextMenu(items[activeIndex].id); }
      return;
    }
    let next = activeIndex;
    if (event.key === "ArrowDown") next = Math.min(items.length - 1, next + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, next - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(items[activeIndex].id);
      return;
    } else return;
    event.preventDefault();
    setFocusedId(items[next].id);
    const element = scrollRef.current;
    if (!element) return;
    const top = next * ROW_HEIGHT;
    const height = element.clientHeight || viewport.height;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + height)
      element.scrollTop = top + ROW_HEIGHT - height;
    setViewport({ top: element.scrollTop, height });
  };

  return (
    <div
      ref={scrollRef}
      className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      onScroll={(event) => {
        const element = event.currentTarget;
        setViewport({ top: element.scrollTop, height: element.clientHeight || INITIAL_HEIGHT });
        if (hasMore && onLoadMore && !loadingMore && !requestingMore.current && element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
          requestingMore.current = true;
          onLoadMore();
        }
      }}
    >
      {loading && !items.length ? (
        <div aria-label="Loading conversations" aria-busy="true" className="space-y-3 p-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[76px] animate-pulse rounded-lg bg-neutral-800/60" />)}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="space-y-3 p-4 text-sm text-rose-300">
          <p>Conversations could not be loaded.</p>
          {onRetry ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : null}
        </div>
      ) : null}
      {!loading && !error && !items.length ? <p role="status" className="px-4 py-12 text-center text-sm text-neutral-400">{emptyText}</p> : null}
      {items.length ? (
        <div
          role="listbox"
          aria-label="Conversation list"
          aria-activedescendant={activeIndex >= start && activeIndex < end ? `${listId}-${activeIndex}` : undefined}
          tabIndex={0}
          onKeyDown={navigate}
          className="relative outline-offset-[-2px]"
          style={{ height: items.length * ROW_HEIGHT }}
        >
          <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
            {items.slice(start, end).map((item, offset) => {
              const index = start + offset;
              return (
                <button
                  id={`${listId}-${index}`}
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  aria-posinset={index + 1}
                  aria-setsize={items.length}
                  tabIndex={-1}
                  onClick={() => { setFocusedId(item.id); onSelect(item.id); }}
                  onContextMenu={onContextMenu ? (event) => { event.preventDefault(); setFocusedId(item.id); onContextMenu(item.id); } : undefined}
                  className={`flex h-[88px] w-full min-w-0 items-center gap-3 border-b border-neutral-800/70 px-3 text-left transition-colors hover:bg-neutral-800/70 ${item.id === selectedId ? "bg-blue-950/40" : ""} ${focusedId === item.id ? "ring-1 ring-inset ring-blue-500/60" : ""}`}
                >
                  <IconAvatar icon={item.avatarPresentation} label={item.title} size="lg" className="!rounded-full" decorative />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-100">{item.title}</span>
                      <time dateTime={item.lastActivityAt ?? undefined} className="ml-auto shrink-0 text-[10px] text-neutral-400">{activityTime(item.lastActivityAt)}</time>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">{item.preview || "No message preview"}</span>
                      {item.unreadCount > 0 ? <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white" aria-label={`${item.unreadCount} unread`}>{item.unreadCount > 999 ? "999+" : item.unreadCount}</span> : null}
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-neutral-400">
                      {item.folders?.length ? item.folders.map((folder) => <span key={folder.id} title={folder.name} className="truncate rounded-full border px-1.5" style={/^#[0-9a-f]{6}$/i.test(folder.color ?? "") ? { borderColor: `${folder.color}80`, backgroundColor: `${folder.color}22`, color: folder.color! } : undefined}>{folder.name}</span>) : <span className="truncate">{[item.status, item.subtitle].filter(Boolean).join(" · ")}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {hasMore && onLoadMore ? <div className="p-3"><Button variant="secondary" className="w-full" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load older conversations"}</Button></div> : null}
    </div>
  );
}
