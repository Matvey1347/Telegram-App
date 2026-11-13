"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "ads:filters-visible";
const CHANGE_EVENT = "ads:filters-visibility-changed";
let volatileValue: boolean | null = null;

function snapshot() {
  if (volatileValue !== null) return volatileValue;
  try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function useAdsFilterVisibility() {
  const open = useSyncExternalStore(subscribe, snapshot, () => false);
  const toggle = () => {
    const next = !snapshot();
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
      volatileValue = null;
    } catch { volatileValue = next; }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [open, toggle] as const;
}
