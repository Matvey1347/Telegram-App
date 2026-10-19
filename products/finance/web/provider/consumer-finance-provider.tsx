"use client";

import {
  dehydrate,
  hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { type PropsWithChildren, useEffect, useState } from "react";
import { FinanceFeedbackProvider } from "@consumer-finance/web/components/ui/finance-feedback";
import financeStyles from "@consumer-finance/web/components/ui/finance-ui.module.css";
import { registerFinanceServiceWorker } from "@finance-web/lib/pwa/service-worker";

const CONSUMER_FINANCE_QUERY_CACHE_KEY = "consumer-finance-react-query-cache";
const CONSUMER_FINANCE_QUERY_CACHE_BUSTER = "consumer-finance-cache-v1";
const CONSUMER_FINANCE_QUERY_CACHE_MAX_AGE_MS = 12 * 60 * 60_000;

type PersistedClient = {
  buster?: unknown;
  timestamp?: unknown;
  clientState?: unknown;
};

/**
 * Session and payment state are intentionally not persisted. Financial read
 * models are scoped by bot id in their query key and revalidated on startup.
 */
export function isPersistedConsumerFinanceQuery(queryKey: readonly unknown[]) {
  const [domain, , kind] = queryKey;
  return (
    domain === "consumer-finance" &&
    typeof kind === "string" &&
    ![
      "session",
      "billing",
      "entitlements",
      "browser-login-config",
      "browser-login-challenge",
      "browser-login-approval",
    ].includes(kind)
  );
}

export function clearPersistedConsumerFinanceQueryCache() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CONSUMER_FINANCE_QUERY_CACHE_KEY);
  }
}

/**
 * The stock persistence provider restores in an effect, which guarantees a
 * loading frame even when localStorage already contains a valid snapshot.
 * Restore synchronously while constructing the browser-only client instead.
 */
function restorePersistedConsumerFinanceQueryCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    const persisted = JSON.parse(
      window.localStorage.getItem(CONSUMER_FINANCE_QUERY_CACHE_KEY) ?? "null",
    ) as PersistedClient | null;
    const isValid =
      persisted &&
      persisted.buster === CONSUMER_FINANCE_QUERY_CACHE_BUSTER &&
      typeof persisted.timestamp === "number" &&
      Date.now() - persisted.timestamp <= CONSUMER_FINANCE_QUERY_CACHE_MAX_AGE_MS &&
      persisted.clientState;
    if (!isValid) {
      if (persisted) clearPersistedConsumerFinanceQueryCache();
      return;
    }
    hydrate(queryClient, persisted.clientState);
  } catch {
    clearPersistedConsumerFinanceQueryCache();
  }
}

/** Consumer Finance owns a bot-scoped persisted read cache and local feedback UI. */
export function ConsumerFinanceProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
        defaultOptions: {
          queries: {
            // Cached data is rendered immediately, then verified after a short
            // freshness window. This avoids polling while keeping another
            // surface's completed transaction from lingering for minutes.
            staleTime: 30_000,
            gcTime: 45 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
    });
    restorePersistedConsumerFinanceQueryCache(client);
    return client;
  });
  const [persister] = useState(() =>
    typeof window === "undefined"
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: CONSUMER_FINANCE_QUERY_CACHE_KEY,
          throttleTime: 1_000,
        }),
  );
  useEffect(() => {
    void registerFinanceServiceWorker().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!persister) return;
    const persist = () => {
      persister.persistClient({
        buster: CONSUMER_FINANCE_QUERY_CACHE_BUSTER,
        timestamp: Date.now(),
        clientState: dehydrate(queryClient, {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            isPersistedConsumerFinanceQuery(query.queryKey),
        }),
      });
    };
    return queryClient.getQueryCache().subscribe((event) => {
      if (["added", "removed", "updated"].includes(event.type)) persist();
    });
  }, [persister, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <div
        data-consumer-finance-theme="neutral-blue"
        className={`${financeStyles.themeRoot} min-h-full bg-neutral-950 text-white`}
      >
        <FinanceFeedbackProvider>{children}</FinanceFeedbackProvider>
      </div>
    </QueryClientProvider>
  );
}
