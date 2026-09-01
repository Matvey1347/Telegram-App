"use client";

import { useEffect, useRef, useState } from "react";
import type { CrmRealtimeEvent } from "@telegram-system/shared";
import { fetchCrmEventStream } from "./telegram-crm-api";

const MAX_RECONNECT_ATTEMPTS = 6;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function useTelegramCrmRealtime({
  active,
  onEvent,
  onReconnect,
}: {
  active: boolean;
  onEvent: (event: CrmRealtimeEvent) => void;
  onReconnect?: () => void;
}) {
  const [status, setStatus] = useState<"connecting" | "connected" | "paused">("connecting");
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const connect = () => {
      controller = new AbortController();
      void fetchCrmEventStream({
        signal: controller.signal,
        onEvent: (event) => onEventRef.current(event),
        onOpen: () => {
          setStatus("connected");
          if (attempts > 0) onReconnectRef.current?.();
          attempts = 0;
        },
      }).catch(() => undefined).finally(() => {
        if (stopped || controller?.signal.aborted) return;
        attempts += 1;
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          setStatus("paused");
          return;
        }
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
  }, [active]);
  return status;
}
