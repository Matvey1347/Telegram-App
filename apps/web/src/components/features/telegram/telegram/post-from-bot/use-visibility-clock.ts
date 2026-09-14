"use client";

import { useEffect, useState } from "react";

/** One modal-level clock that sleeps while the document is hidden. */
export function useVisibilityClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timeout: number | undefined;
    const schedule = () => {
      if (document.visibilityState === "hidden") return;
      timeout = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, intervalMs);
    };
    const onVisibilityChange = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = undefined;
      if (document.visibilityState !== "hidden") {
        setNow(Date.now());
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}
