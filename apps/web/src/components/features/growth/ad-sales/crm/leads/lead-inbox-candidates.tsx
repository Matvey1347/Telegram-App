"use client";
import { useLeadText } from "./lead-copy";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import {
  leadAccess,
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { LeadCandidates } from "./lead-candidates";
export function LeadInboxCandidates({ search }: { search: string }) {
  const t = useLeadText();
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: () => authApi.me(),
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
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <Link
        href="/ad-sales/leads"
        className="inline-flex min-h-10 items-center text-sm text-blue-300"
      >
        {t("Open Lead Discovery →")}
      </Link>
      {me.isLoading || config.isLoading ? (
        <p role="status">{t("Loading lead candidates…")}</p>
      ) : !access.view ? (
        <p role="alert" className="text-sm text-neutral-400">
          {t("Lead Discovery view permission is required.")}
        </p>
      ) : config.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t(
            "Lead Discovery could not be loaded. Manual Inbox conversations remain available.",
          )}
        </p>
      ) : config.data ? (
        <LeadCandidates
          key={workspace}
          workspace={workspace}
          canReview={config.data.canReview}
          compact
          externalSearch={search}
        />
      ) : null}
    </div>
  );
}
