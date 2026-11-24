"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { currenciesApi, type ExchangeRate } from "@/lib/api";
import { currencyKeys } from "@/lib/query-keys";

type FinanceDisplay = {
  currency?: string;
  rates?: ExchangeRate[];
  canChoose: boolean;
  setCurrency: (currency: string) => void;
};

const DisplayContext = createContext<FinanceDisplay>({ canChoose: false, setCurrency: () => undefined });
const preferenceEvent = "finance-display-currency-changed";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(preferenceEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(preferenceEvent, notify);
  };
}

export function FinanceDisplayProvider({
  userId, workspaceId, primaryCurrency, canChoose, loadRates, children,
}: PropsWithChildren<{
  userId?: string;
  workspaceId: string;
  primaryCurrency?: string;
  canChoose: boolean;
  loadRates: boolean;
}>) {
  const storageKey = userId && workspaceId ? `finance-display-currency:${userId}:${workspaceId}` : "";
  const getPreference = useCallback(() => storageKey ? window.localStorage.getItem(storageKey) : null, [storageKey]);
  const preference = useSyncExternalStore(subscribe, getPreference, () => null);
  const setCurrency = (currency: string) => {
    if (!canChoose || !storageKey || currency === preference) return;
    window.localStorage.setItem(storageKey, currency);
    window.dispatchEvent(new Event(preferenceEvent));
  };
  const { data: rates } = useQuery({
    queryKey: currencyKeys.latestRates(),
    queryFn: () => currenciesApi.listLatestRates(),
    enabled: canChoose && loadRates,
    refetchOnWindowFocus: false,
  });
  return <DisplayContext.Provider value={{ currency: canChoose ? preference ?? primaryCurrency : undefined, rates, setCurrency, canChoose: canChoose && Boolean(storageKey) }}>
    {children}
  </DisplayContext.Provider>;
}

export const useFinanceDisplay = () => useContext(DisplayContext);
