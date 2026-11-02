"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadAccess,
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { CrmNavigation } from "../crm-navigation";
import { LeadSources } from "./lead-sources";
import { LeadFeed } from "./lead-feed";
import { LeadCandidates } from "./lead-candidates";
import { LeadQueryState } from "./lead-query-state";
export function LeadDiscoveryPage() {
  const t = useLeadText();
  const ru = useOptionalI18n()?.locale === "ru";
  const [feedOpen, setFeedOpen] = useState(false);
  const [tab, setTab] = useState<"sources" | "candidates">("sources");
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 300_000,
  });
  const workspace = me.data?.workspace.id ?? "";
  const access = leadAccess(me.data?.workspace.access);
  const config = useQuery({
    queryKey: leadKeys.config(workspace),
    queryFn: leadDiscoveryApi.config,
    enabled: !!workspace && access.view,
    ...leadQueryPolicy,
  });
  return (
    <AppShell>
      <div className="min-w-0 space-y-4">
        <CrmNavigation />
        {me.isLoading ? (
          <p role="status">{t("Loading workspace access…")}</p>
        ) : !access.view ? (
          <p role="alert">{t("Lead Discovery view permission is required.")}</p>
        ) : (
          <>
            <LeadQueryState
              loading={config.isLoading}
              error={config.isError}
              empty={false}
              onRetry={() => void config.refetch()}
            />
            {config.data ? (
              <>
                {!config.data.enabled ? <div role="status" className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
                  Search is currently disabled. Add your sources to prepare the list; collection and analysis require the deployment and workspace permissions to be enabled.
                </div> : null}
                <div role="tablist" aria-label="Lead Discovery" className="flex gap-1 border-b border-neutral-800">
                  <button role="tab" aria-selected={tab === "sources"} onClick={() => setTab("sources")} className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === "sources" ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>{t("Sources")}</button>
                  <button role="tab" aria-selected={tab === "candidates"} onClick={() => setTab("candidates")} className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === "candidates" ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}>{ru ? "Кандидаты" : "Candidates"}</button>
                </div>
                {tab === "sources" ? <LeadSources key={workspace} workspace={workspace} config={config.data} /> : <>
                  <LeadCandidates key={workspace} workspace={workspace} canReview={config.data.canReview}/>
                  <details className="rounded-xl border border-neutral-800 px-3 py-2" onToggle={(event) => setFeedOpen(event.currentTarget.open)}>
                    <summary className="cursor-pointer text-sm text-neutral-300">{t("Advertisement feed")}</summary>
                    {feedOpen ? <div className="mt-3"><LeadFeed key={workspace} workspace={workspace} config={config.data}/></div> : null}
                  </details>
                </>}
              </>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
