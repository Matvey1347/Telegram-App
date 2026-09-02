"use client";

import type { OperationsNotificationItem } from "@telegram-system/shared";
import { ArrowLeft, Bell, Settings, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/primitives";
import { NotificationRow } from "./notification-row";

export type NotificationPanelState = {
  items: OperationsNotificationItem[];
  loading: boolean;
  error: boolean;
  paginationError: boolean;
  hasMore: boolean;
  loadingMore: boolean;
};

function NotificationSkeletons() {
  return (
    <div
      aria-label="Loading notifications"
      className="divide-y divide-neutral-800"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex animate-pulse gap-3 px-4 py-4">
          <span className="h-8 w-8 rounded-lg bg-neutral-800" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-24 rounded bg-neutral-800" />
            <span className="block h-4 w-3/4 rounded bg-neutral-800" />
            <span className="block h-3 w-full rounded bg-neutral-900" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function NotificationPanel({
  open,
  onClose,
  unread,
  state,
  busy,
  settingsOpen,
  onSettingsChange,
  onMarkAll,
  onMarkVisible,
  onOpenNotification,
  onRetry,
  onLoadMore,
  anchorStyle,
  settings,
  actionError,
}: {
  open: boolean;
  onClose: () => void;
  unread: number;
  state: NotificationPanelState;
  busy: boolean;
  settingsOpen: boolean;
  onSettingsChange: (open: boolean) => void;
  onMarkAll: () => void;
  onMarkVisible: () => void;
  onOpenNotification: (notification: OperationsNotificationItem) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  anchorStyle?: CSSProperties;
  settings: ReactNode;
  actionError?: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  const visibleUnread = state.items.filter((item) => !item.readAt).length;
  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-black/60 lg:bg-black/30"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={anchorStyle}
        className="fixed inset-x-3 bottom-3 top-16 z-50 flex flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl lg:inset-x-auto lg:bottom-auto lg:h-[min(720px,calc(100dvh-5rem))] lg:w-[390px]"
      >
        <header className="border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            {settingsOpen ? (
              <button
                type="button"
                onClick={() => onSettingsChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white"
                aria-label="Back to notifications"
              >
                <ArrowLeft size={17} />
              </button>
            ) : (
              <Bell size={17} className="text-neutral-400" aria-hidden="true" />
            )}
            <h2
              id={titleId}
              className="min-w-0 flex-1 text-base font-semibold text-white"
            >
              {settingsOpen ? "Notification settings" : "Notifications"}
            </h2>
            {!settingsOpen ? (
              <span className="text-xs text-neutral-400">{unread} unread</span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Close notifications"
            >
              <X size={17} />
            </button>
          </div>
          {!settingsOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="!px-2.5 !py-1.5 text-xs"
                onClick={() => onSettingsChange(true)}
              >
                <Settings size={14} /> Push & app
              </Button>
              <Button
                variant="secondary"
                className="!px-2.5 !py-1.5 text-xs"
                disabled={busy || unread === 0}
                onClick={onMarkAll}
              >
                Mark all read
              </Button>
              <button
                type="button"
                disabled={busy || visibleUnread === 0}
                onClick={onMarkVisible}
                className="ml-auto text-xs text-neutral-400 hover:text-white disabled:opacity-40"
              >
                Mark visible read
              </button>
            </div>
          ) : null}
          {actionError ? (
            <p role="alert" className="mt-2 text-xs text-rose-300">
              {actionError}
            </p>
          ) : null}
        </header>
        {settingsOpen ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{settings}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {state.loading ? <NotificationSkeletons /> : null}
            {state.error ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <p className="text-sm font-medium text-white">
                  Notifications could not be loaded.
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Your unread badge is kept separate.
                </p>
                <Button variant="secondary" className="mt-4" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            ) : null}
            {!state.loading && !state.error && !state.items.length ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <Bell
                  size={26}
                  className="mb-3 text-neutral-600"
                  aria-hidden="true"
                />
                <p className="text-sm text-neutral-300">
                  You’re all caught up. New CRM activity will appear here.
                </p>
              </div>
            ) : null}
            {!state.error
              ? state.items.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onOpen={onOpenNotification}
                  />
                ))
              : null}
            {state.items.length ? (
              <div className="p-3 text-center">
                {state.paginationError ? (
                  <div>
                    <p className="mb-2 text-xs text-rose-300">
                      More notifications could not be loaded.
                    </p>
                    <Button variant="secondary" onClick={onLoadMore}>
                      Retry
                    </Button>
                  </div>
                ) : state.hasMore ? (
                  <Button
                    variant="secondary"
                    disabled={state.loadingMore}
                    onClick={onLoadMore}
                  >
                    {state.loadingMore ? "Loading…" : "Load more"}
                  </Button>
                ) : (
                  <p className="text-xs text-neutral-600">
                    End of recent activity
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </>,
    document.body,
  );
}
