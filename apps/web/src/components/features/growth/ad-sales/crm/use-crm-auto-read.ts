"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useDocumentVisibility } from "@/hooks/use-document-visibility";
import { hasBodyScrollLock, subscribeBodyScrollLock } from "@/lib/body-scroll-lock";

function subscribeWindowFocus(onChange: () => void) {
  window.addEventListener("focus", onChange);
  window.addEventListener("blur", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("blur", onChange);
  };
}

function documentHasFocus() {
  return document.hasFocus();
}

/** Mark only the newest rendered Telegram watermark once while actively viewing it. */
export function useCrmAutoRead({
  enabled,
  nearBottom,
  unreadCount,
  latestVisibleId,
  pending,
  failed,
  markRead,
}: {
  enabled: boolean;
  nearBottom: boolean;
  unreadCount: number;
  latestVisibleId: number | null;
  pending: boolean;
  failed: boolean;
  markRead: (watermark: number) => void;
}) {
  const visible = useDocumentVisibility();
  const focused = useSyncExternalStore(subscribeWindowFocus, documentHasFocus, () => false);
  const overlayOpen = useSyncExternalStore(subscribeBodyScrollLock, hasBodyScrollLock, () => false);
  const lastAttempt = useRef<number | null>(null);
  useEffect(() => {
    if (
      !enabled || !nearBottom || !visible || !focused || !document.hasFocus() || document.visibilityState !== "visible" || overlayOpen || hasBodyScrollLock() ||
      document.querySelector('[data-app-modal="true"][aria-modal="true"], dialog[open]') || unreadCount <= 0 || pending || failed ||
      latestVisibleId === null || !Number.isSafeInteger(latestVisibleId) || latestVisibleId <= 0 ||
      (lastAttempt.current !== null && latestVisibleId <= lastAttempt.current)
    ) return;
    lastAttempt.current = latestVisibleId;
    markRead(latestVisibleId);
  }, [enabled, nearBottom, visible, focused, overlayOpen, unreadCount, latestVisibleId, pending, failed, markRead]);
}
