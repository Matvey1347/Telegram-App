"use client";
import { useAiText } from "./ai-copy";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AiUsageFilter } from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { Button, PageHeader } from "@/components/ui/primitives";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { aiApi } from "@/lib/features/operations/ai-api";
import { aiKeys, aiQueryPolicy } from "@/lib/features/operations/ai-query-keys";
import { AiDashboard } from "./ai-dashboard";
import { AiFilters } from "./ai-filters";
import { AiOperations } from "./ai-operations";
import { AiConfigurationPanel } from "./ai-configuration";
import { aiPermissions } from "./ai-format";
export function AiUsagePage() {
  const t = useAiText();
  const [tab, setTab] = useState<"usage" | "config">("usage");
  const [filter, setFilter] = useState<AiUsageFilter>({});
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 300_000,
  });
  const workspaceId = me.data?.workspace.id ?? "";
  const permissions = aiPermissions(me.data?.workspace.access);
  const activeTab = permissions.view ? tab : "config";
  const scopedFilter = { ...filter, workspaceId };
  const query = useQuery({
    queryKey: aiKeys.usage(workspaceId, scopedFilter),
    queryFn: () => aiApi.usage(scopedFilter),
    enabled: !!workspaceId && permissions.view && activeTab === "usage",
    ...aiQueryPolicy,
  });
  return (
    <AppShell>
      <div className="min-w-0 space-y-5">
        <PageHeader
          title={t("AI Usage")}
          subtitle={t(
            "Workspace costs, token usage and execution limits. USD · UTC · 90-day history.",
          )}
        />
        {me.isLoading ? (
          <p role="status">{t("Loading access…")}</p>
        ) : me.isError ? (
          <p role="alert">{t("Workspace access could not be loaded.")}</p>
        ) : !permissions.view && !permissions.manage ? (
          <p role="alert">
            {t("AI usage permission is required for this workspace.")}
          </p>
        ) : (
          <>
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="AI usage sections"
            >
              <Button
                role="tab"
                disabled={!permissions.view}
                aria-selected={activeTab === "usage"}
                variant={activeTab === "usage" ? "primary" : "secondary"}
                onClick={() => setTab("usage")}
              >
                {t("Usage & requests")}
              </Button>
              <Button
                role="tab"
                aria-selected={activeTab === "config"}
                variant={activeTab === "config" ? "primary" : "secondary"}
                onClick={() => setTab("config")}
              >
                {t("Configuration")}
              </Button>
            </div>
            {activeTab === "config" ? (
              <AiConfigurationPanel
                key={workspaceId}
                workspaceId={workspaceId}
              />
            ) : (
              <>
                <AiFilters filter={filter} onChange={setFilter} />
                <p className="text-xs text-neutral-400">
                  {t(
                    "Choose up to 90 days. Leave dates empty for the last 30 days. Workspace selection uses the shared switcher.",
                  )}
                </p>
                {query.isLoading ? (
                  <div
                    role="status"
                    aria-busy="true"
                    className="h-48 animate-pulse rounded-lg bg-neutral-900 p-5"
                  >
                    {t("Loading usage…")}
                  </div>
                ) : query.isError ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-900 p-4"
                  >
                    Usage could not be loaded. Check the date range and retry.{" "}
                    <Button
                      variant="secondary"
                      onClick={() => void query.refetch()}
                    >
                      {t("Retry")}
                    </Button>
                  </div>
                ) : query.data ? (
                  <AiDashboard data={query.data} />
                ) : null}
                <AiOperations
                  key={workspaceId}
                  workspaceId={workspaceId}
                  filter={scopedFilter}
                  canManage={permissions.manage}
                />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
