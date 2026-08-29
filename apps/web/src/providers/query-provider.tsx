"use client";

import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PropsWithChildren, useState } from "react";

const PERSISTED_QUERY_KEYS = [
  "auth",
  "account-me",
  "workspaces",
  "workspace-selected",
  "workspace-members",
  "telegram-channels",
  "telegram-managed-posts",
  "post-groups",
  "post-group",
  "prompt-notes",
  "icons",
  "icon",
  "currency-settings",
  "currency-rates",
  "currency-rates-latest",
  "accounts",
  "transaction-categories",
  "transaction-categories-admin",
  "telegram-channel-networks",
  "advertising-people",
  "promos",
  "ad-campaigns",
  "ad-hypotheses",
  "telegram-ad-products",
  "telegram-ad-policy",
  "telegram-ad-price-history",
  "scheduled-tasks",
] as const;

const workspaceScopedQueryKeys = new Set<string>([
  "account-me",
  "workspace-selected",
  "workspace-members",
  "telegram-channels",
  "telegram-channel-analytics",
  "telegram-channel-analytics-sources",
  "telegram-channel-posts",
  "telegram-channel-audience",
  "telegram-channel-financial-summary",
  "telegram-channel-audience-snapshots",
  "telegram-channel-invite-links",
  "telegram-channel-campaigns",
  "telegram-managed-posts",
  "telegram-managed-post-link-targets",
  "post-groups",
  "post-group",
  "prompt-notes",
  "currency-settings",
  "currency-rates",
  "currency-rates-latest",
  "accounts",
  "transactions",
  "transfers",
  "transaction-categories",
  "transaction-categories-admin",
  "telegram-channel-networks",
  "advertising-people",
  "promos",
  "ad-campaigns",
  "ad-campaign",
  "ad-campaigns-performance",
  "ad-campaigns-hypothesis-form",
  "ad-campaign-admission-view-analytics",
  "campaign-invite-link-history",
  "invite-link-history",
  "ad-hypotheses",
  "ad-hypothesis-detail",
  "ad-hypothesis-history",
  "channel-promos",
  "channel-invite-links-select",
  "telegram-bots",
  "telegram-system-bot",
  "telegram-source-channels",
  "telegram-user-accounts",
  "telegram-channel-ad-analyses",
  "telegram-channel-custom-emoji-packs",
  "telegram-managed-posts-calendar",
  "telegram-managed-post-history",
  "telegram-ad-sales",
  "telegram-ad-sale",
  "telegram-ad-availability",
  "telegram-ad-products",
  "telegram-ad-policy",
  "telegram-ad-baseline",
  "telegram-ad-price-history",
  "telegram-ad-analytics",
  "dashboard-summary",
  "application-logs",
  "application-log-filter-options",
  "scheduled-tasks",
  "global-search",
  "icons",
  "icon",
  "trash",
]);

export const QUERY_PERSIST_STORAGE_KEY = "telegram-system-react-query-cache";

export function clearPersistedQueryCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(QUERY_PERSIST_STORAGE_KEY);
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 4 * 60_000,
            gcTime: 45 * 60_000,
            placeholderData: keepPreviousData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );
  const [persister] = useState(() =>
    typeof window === "undefined"
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: QUERY_PERSIST_STORAGE_KEY,
          throttleTime: 1_000,
        }),
  );
  const [buster] = useState(() => {
    if (typeof window === "undefined") return "server";
    // Key families changed; do not hydrate pre-v2 root/list collisions.
    return `cache-v2:workspace:${window.localStorage.getItem("selected-workspace-id") ?? "none"}`;
  });

  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster,
        maxAge: 45 * 60_000,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== "success") return false;
            const [root] = query.queryKey;
            return (
              typeof root === "string" &&
              (PERSISTED_QUERY_KEYS as readonly string[]).includes(root)
            );
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export function isWorkspaceScopedQuery(queryKey: readonly unknown[]) {
  const [root] = queryKey;
  return typeof root === "string" && workspaceScopedQueryKeys.has(root);
}
