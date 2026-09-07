"use client";

import { useCallback, useEffect, useState } from "react";

export type TransientActionStatus = "idle" | "sending" | "sent";

export function useTransientActionStatus(resetAfterMs = 1800) {
  const [status, setStatus] = useState<TransientActionStatus>("idle");
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (status !== "sending") return;
    const interval = window.setInterval(
      () => setDots((current) => (current % 3) + 1),
      350,
    );
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status !== "sent") return;
    const timeout = window.setTimeout(() => setStatus("idle"), resetAfterMs);
    return () => window.clearTimeout(timeout);
  }, [resetAfterMs, status]);

  const start = useCallback(() => {
    setDots(1);
    setStatus("sending");
  }, []);
  const sent = useCallback(() => setStatus("sent"), []);
  const reset = useCallback(() => setStatus("idle"), []);

  return { status, dots, start, sent, reset };
}
