"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Button, PageHeader } from "@/components/ui/primitives";
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
  const [tab, setTab] = useState<"sources" | "feed" | "review">("sources");
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
        <PageHeader
          title={t("Lead Discovery")}
          subtitle={t(
            "Permitted sources → advertisement evidence → human review → existing CRM.",
          )}
        />
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
                <div
                  role="tablist"
                  aria-label="Lead Discovery sections"
                  className="flex flex-wrap gap-2"
                >
                  {(["sources", "feed", "review"] as const).map((v) => (
                    <Button
                      className="max-w-full !whitespace-normal"
                      key={v}
                      role="tab"
                      aria-selected={tab === v}
                      variant={tab === v ? "primary" : "secondary"}
                      onClick={() => setTab(v)}
                    >
                      {
                        {
                          sources: t("Sources"),
                          feed: t("Advertisement feed"),
                          review: t("Review queue"),
                        }[v]
                      }
                    </Button>
                  ))}
                </div>
                {tab === "sources" ? (
                  <LeadSources
                    key={workspace}
                    workspace={workspace}
                    config={config.data}
                  />
                ) : tab === "feed" ? (
                  <LeadFeed
                    key={workspace}
                    workspace={workspace}
                    config={config.data}
                  />
                ) : (
                  <LeadCandidates
                    key={workspace}
                    workspace={workspace}
                    canReview={config.data.canReview}
                  />
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
