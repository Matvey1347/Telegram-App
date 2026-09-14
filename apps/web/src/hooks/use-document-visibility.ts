"use client";

import { useSyncExternalStore } from "react";

function subscribe(onVisibilityChange: () => void) {
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () =>
    document.removeEventListener("visibilitychange", onVisibilityChange);
}

function isDocumentVisible() {
  return document.visibilityState !== "hidden";
}

/** Keeps long-lived browser work active only while its tab can be used. */
export function useDocumentVisibility() {
  return useSyncExternalStore(subscribe, isDocumentVisible, () => true);
}
