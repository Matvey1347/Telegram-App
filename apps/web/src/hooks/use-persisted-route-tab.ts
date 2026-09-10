"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type UpdateSearchParams = (params: URLSearchParams) => void;
const ROUTE_TAB_STORAGE_EVENT = "telegram-system:route-tab-storage";

function subscribeToRouteTabStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ROUTE_TAB_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ROUTE_TAB_STORAGE_EVENT, onStoreChange);
  };
}

function subscribeToHydration() {
  return () => undefined;
}

export function resolvePersistedRouteTab<T extends string>(
  routeValue: string | null,
  storedValue: string | null,
  allowedValues: readonly T[],
  defaultValue: T,
): T {
  if (allowedValues.includes(routeValue as T)) return routeValue as T;
  if (allowedValues.includes(storedValue as T)) return storedValue as T;
  return defaultValue;
}

export function usePersistedRouteTab<T extends string>({
  param,
  storageKey,
  allowedValues,
  defaultValue,
}: {
  param: string;
  storageKey: string;
  allowedValues: readonly T[];
  defaultValue: T;
}) {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const routeValue = searchParams.get(param);
  const routeTab = allowedValues.includes(routeValue as T)
    ? (routeValue as T)
    : null;
  const storedTab = useSyncExternalStore(
    subscribeToRouteTabStorage,
    () => {
      const stored = window.localStorage.getItem(storageKey);
      return allowedValues.includes(stored as T) ? (stored as T) : null;
    },
    () => null,
  );
  const ready = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (routeTab) {
      if (storedTab !== routeTab) {
        window.localStorage.setItem(storageKey, routeTab);
        window.dispatchEvent(new Event(ROUTE_TAB_STORAGE_EVENT));
      }
      return;
    }
    if (!storedTab || storedTab === defaultValue) return;
    const params = new URLSearchParams(searchString);
    params.set(param, storedTab);
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    defaultValue,
    param,
    pathname,
    routeTab,
    replace,
    searchString,
    storageKey,
    storedTab,
  ]);

  const tab = resolvePersistedRouteTab(
    routeTab,
    storedTab,
    allowedValues,
    defaultValue,
  );
  const setTab = (nextTab: T, updateSearchParams?: UpdateSearchParams) => {
    const params = new URLSearchParams(searchString);
    params.set(param, nextTab);
    updateSearchParams?.(params);
    window.localStorage.setItem(storageKey, nextTab);
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return [tab, setTab, ready] as const;
}
