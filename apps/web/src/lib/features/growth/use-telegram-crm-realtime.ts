"use client";

import { useEffect, useRef, useState } from "react";
import type { CrmRealtimeEvent } from "@telegram-system/shared";
import { useDocumentVisibility } from "@/hooks/use-document-visibility";
import { fetchCrmEventStream } from "./telegram-crm-api";

const MAX_RECONNECT_DELAY_MS = 30_000;

export function useTelegramCrmRealtime({
  active,
  onEvent,
  onReconnect,
  scopeKey,
}: {
  active: boolean;
  onEvent: (event: CrmRealtimeEvent) => void;
  onReconnect?: () => void;
  /** Reopen the authenticated stream when the active workspace changes. */
  scopeKey?: string;
}) {
  const [status, setStatus] = useState<"connecting" | "connected">(
    "connecting",
  );
  const documentVisible = useDocumentVisibility();
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!active || !documentVisible) return;
    let stopped = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const connect = () => {
      const currentController = new AbortController();
      controller = currentController;
      void fetchCrmEventStream({
        signal: currentController.signal,
        onEvent: (event) => onEventRef.current(event),
        onOpen: () => {
          setStatus("connected");
          // The initial list read can precede stream attachment. Reconcile
          // after every successful handshake so that gap is never permanent.
          onReconnectRef.current?.();
          attempts = 0;
        },
      })
        .catch(() => undefined)
        .finally(() => {
          if (controller === currentController) controller = null;
          if (stopped || currentController.signal.aborted) return;
          attempts += 1;
          setStatus("connecting");
          const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            1_000 * 2 ** (attempts - 1),
          );
          reconnectTimer = setTimeout(connect, delay);
        });
    };

    connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [active, documentVisible, scopeKey]);
  return status;
}
