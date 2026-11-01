"use client";

import { useSyncExternalStore } from "react";

export const CHAT_DETAILS_MOBILE_QUERY = "(max-width: 768px)";

export function chatDetailsAreMobile() {
  if (typeof window === "undefined") return false;
  return typeof window.matchMedia === "function"
    ? window.matchMedia(CHAT_DETAILS_MOBILE_QUERY).matches
    : window.innerWidth <= 768;
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") {
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }
  const media = window.matchMedia(CHAT_DETAILS_MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Matches the breakpoint that makes client details a fullscreen modal. */
export function useChatDetailsMobile() {
  return useSyncExternalStore(subscribe, chatDetailsAreMobile, () => false);
}
