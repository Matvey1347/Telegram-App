"use client";

import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PropsWithChildren, useState } from "react";
import {
  queryRetryDelay,
  shouldRetryQuery,
} from "@/lib/http/development-query-retry";
import { accountKeys, workspaceKeys } from "@/lib/query-keys";

const PERSISTED_QUERY_KEYS = [
  "auth",
  "account-me",
  "account-shell",
  "dashboard-summary",
  "workspaces",
  "workspace-selected",
  "workspace-members",
  "telegram-channels",
  "telegram-managed-posts",
  "post-groups",
  "post-group",
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
  "telegram-publication-schedules",
  "mutual-promotion-folders",
  "cross-promotion-plans",
  "scheduled-tasks",
] as const;

const workspaceScopedQueryKeys = new Set<string>([
  "crm-manual",
  "lead-discovery",
  "account-me",
  "account-shell",
  "workspace-selected",
  "workspace-members",
  "telegram-channels",
  "telegram-channel-reminders",
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
  "telegram-publication-schedules",
  "telegram-managed-post-history",
  "telegram-post-batches",
  "telegram-ad-sales",
  "telegram-ad-sale",
  "telegram-ad-availability",
  "telegram-ad-products",
  "telegram-ad-policy",
  "telegram-ad-baseline",
  "telegram-ad-price-history",
  "telegram-ad-analytics",
  "mutual-promotion-folders",
  "cross-promotion-plans",
  "telegram-crm",
  "dashboard-summary",
  "application-logs",
  "application-log-filter-options",
  "scheduled-tasks",
  "operations-notifications",
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

export function isPersistedQuery(queryKey: readonly unknown[]) {
  const [root] = queryKey;
  if (root === "telegram-publication-schedules") {
    if (queryKey[1] === "list" || queryKey[1] === "assignment") return true;
    if (queryKey[1] !== "calendar" || queryKey.length !== 4) return false;

    // Calendar navigation can create many historical range keys. Persist only
    // month-sized windows near today; slot availability reads may span 100
    // channels and 62 days, so they stay in the in-session query cache.
    const range = queryKey[3] as { from?: unknown; to?: unknown } | undefined;
    const from = typeof range?.from === "string" ? Date.parse(range.from) : NaN;
    const to = typeof range?.to === "string" ? Date.parse(range.to) : NaN;
    const now = Date.now();
    const windowMs = 45 * 24 * 60 * 60_000;
    return (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      to > from &&
      to - from <= windowMs &&
      from >= now - windowMs &&
      to <= now + windowMs
    );
  }
  if (root === "telegram-managed-posts-calendar") {
    const from =
      typeof queryKey[2] === "string" ? Date.parse(queryKey[2]) : NaN;
    const to = typeof queryKey[3] === "string" ? Date.parse(queryKey[3]) : NaN;
    const now = Date.now();
    const windowMs = 45 * 24 * 60 * 60_000;
    return (
      queryKey.length === 4 &&
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      to > from &&
      to - from <= windowMs &&
      from >= now - windowMs &&
      to <= now + windowMs
    );
  }
  if (root === "telegram-bots") {
    // The configured-bot overview is a compact dashboard read model whose
    // Finance service can take several seconds to respond. Persist that
    // workspace-scoped summary, but keep the full bot catalog in memory only.
    return queryKey[1] === "configured" && queryKey.length === 2;
  }
  if (root === "dashboard-summary") {
    // Preserve only the default, month-sized landing view. All-time and
    // arbitrary custom ranges can contain large historical breakdowns and
    // would accumulate unbounded entries in synchronous localStorage.
    if (queryKey[1] !== "month") return false;
    const from =
      typeof queryKey[2] === "string" ? Date.parse(queryKey[2]) : NaN;
    const to = typeof queryKey[3] === "string" ? Date.parse(queryKey[3]) : NaN;
    return (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      to > from &&
      to - from <= 45 * 24 * 60 * 60_000
    );
  }
  if (root === "telegram-ad-availability") {
    // Persist only ordinary calendar windows to keep storage bounded. Larger
    // channel/range reads stay in memory and are fetched when requested.
    const params = queryKey[1] as
      | { from?: unknown; to?: unknown; channelIds?: unknown }
      | undefined;
    const from =
      typeof params?.from === "string" ? Date.parse(params.from) : NaN;
    const to = typeof params?.to === "string" ? Date.parse(params.to) : NaN;
    const channelCount = Array.isArray(params?.channelIds)
      ? params.channelIds.length
      : 0;
    return (
      Number.isFinite(from) &&
      Number.isFinite(to) &&
      to > from &&
      to - from <= 45 * 24 * 60 * 60_000 &&
      channelCount > 0 &&
      channelCount <= 30
    );
  }
  if (root === "lead-discovery") {
    // Source registry rows are workspace scoped and safe to reuse while the
    // network revalidates. Candidate details/evidence and feed data stay out.
    return queryKey[2] === "sources";
  }
  if (root === "telegram-managed-posts") {
    // Full archive reads can contain every post and its large text/media
    // metadata. Keep them in the in-memory query cache for tab switches, but
    // avoid serializing the entire archive into synchronous localStorage.
    const params = queryKey[3];
    return (
      queryKey[2] === "list" &&
      (!params ||
        typeof params !== "object" ||
        !("all" in params) ||
        params.all !== true)
    );
  }
  return (
    typeof root === "string" &&
    (PERSISTED_QUERY_KEYS as readonly string[]).includes(root)
  );
}

export function createAppQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 4 * 60_000,
        gcTime: 45 * 60_000,
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
    },
  });
  const dailyReadStaleTime = 24 * 60 * 60_000;
  client.setQueryDefaults(workspaceKeys.workspaces(), {
    staleTime: dailyReadStaleTime,
  });
  client.setQueryDefaults(accountKeys.shell(), {
    staleTime: dailyReadStaleTime,
  });
  client.setQueryDefaults(["telegram-channel-networks"], {
    staleTime: dailyReadStaleTime,
  });
  // Workspace publication plans change only through the schedule editor or a
  // channel assignment; both mutation paths invalidate this family.
  client.setQueryDefaults(["telegram-publication-schedules", "list"], {
    staleTime: dailyReadStaleTime,
  });
  // Lightweight channel selectors are shared by editors across major tabs.
  // Channel import/update/lifecycle paths invalidate this family explicitly.
  client.setQueryDefaults(["telegram-channels", "select"], {
    staleTime: 15 * 60_000,
  });
  // Keep PII-bearing CRM contact pages in memory only, but reuse them briefly
  // across route revisits. Contact edits, sales, imports and realtime events
  // invalidate the contact-list family directly.
  client.setQueryDefaults(["telegram-crm", "contacts", "list"], {
    staleTime: 2 * 60_000,
  });
  client.setQueryDefaults(["telegram-user-accounts"], {
    staleTime: dailyReadStaleTime,
  });
  // The configured-bot overview is workspace-scoped, persisted and relatively
  // slow to assemble. Profile mutations reconcile it directly; manual refresh
  // remains available for upstream Telegram changes.
  client.setQueryDefaults(["telegram-bots", "configured"], {
    staleTime: 15 * 60_000,
  });
  // Currency preferences change only through the Currencies screen, where
  // both keys are invalidated after a successful save. Exchange rates update
  // independently, so keep their reuse window shorter.
  client.setQueryDefaults(["currency-settings"], {
    staleTime: dailyReadStaleTime,
  });
  client.setQueryDefaults(["currency-rates-latest"], {
    staleTime: 15 * 60_000,
  });
  client.setQueryDefaults(["telegram-channels", "lifecycle-list"], {
    staleTime: dailyReadStaleTime,
  });
  // The compact advertising-people catalog is shared by Telegram Channels
  // and campaign editors; its import/delete flows invalidate this read root.
  client.setQueryDefaults(["advertising-people"], {
    staleTime: 15 * 60_000,
  });
  return client;
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createAppQueryClient);
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
        // Keep persisted daily card read models available across browser
        // restarts; individual queries still use their own staleTime and
        // mutation invalidation rules.
        maxAge: 24 * 60 * 60_000,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== "success") return false;
            return isPersistedQuery(query.queryKey);
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
  return (
    (root === "operations" && queryKey[1] === "ai") ||
    (typeof root === "string" && workspaceScopedQueryKeys.has(root))
  );
}
