"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/primitives";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import {
  leadAccess,
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { LeadCandidateDetails } from "./lead-candidate-details";
import { useQualificationText } from "./qualification-copy";
export function LeadContactPreparations({ contactId }: { contactId: string }) {
  const t = useQualificationText();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: () => authApi.me(),
    staleTime: 300000,
  });
  const workspace = me.data?.workspace.id ?? "";
  const access = leadAccess(me.data?.workspace.access);
  const query = useQuery({
    queryKey: leadKeys.contactPreparations(workspace, contactId),
    queryFn: ({ signal }) => leadPreparationApi.contact(contactId, signal),
    enabled: open && !!workspace && access.view,
    ...leadQueryPolicy,
  });
  if (!access.view) return null;
  return (
    <section className="space-y-3 border-t border-neutral-800 pt-4">
      <Button
        variant="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {t("AI-discovered sources and prepared offers")}
      </Button>
      {open ? (
        <>
          {query.isLoading ? (
            <p role="status">{t("Loading qualification…")}</p>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-sm text-amber-200">
              {t(
                "Linked evidence unavailable. Check current CRM and Lead permissions.",
              )}{" "}
              <button
                onClick={() => void query.refetch()}
                className="text-blue-300 underline"
              >
                {t("Retry")}
              </button>
            </p>
          ) : null}
          {query.data && !query.data.items.length ? (
            <p className="text-sm text-neutral-400">
              {t("No linked Discovery evidence.")} <Link href="/ad-sales/leads" className="text-blue-300 underline">Add reviewed advertising material in AI Leads</Link>
            </p>
          ) : null}
          {query.data?.items.map((v) => (
            <div key={v.id} className="space-y-1">
              <button
                className="min-h-11 text-left text-sm text-blue-300"
                onClick={() => setSelected(v.id)}
              >
                {v.title}
              </button>
              <p className="break-words text-xs text-neutral-400">
                {v.offerType} · {t(v.preparation?.workflowState ?? "LINKED")} ·{" "}
                {v.sources.map((s) => s.title).join(" · ")}
              </p>
              <p className="text-xs text-amber-200">
                {v.preparation?.qualification?.score?.riskLevel ?? v.riskStatus}
              </p>
            </div>
          ))}
          {query.data?.hasMore ? (
            <p className="text-xs text-neutral-400">
              {t(
                "More acquisition records exist. Use the review queue for the remaining candidates.",
              )}
            </p>
          ) : null}
        </>
      ) : null}
      {selected ? (
        <LeadCandidateDetails
          workspace={workspace}
          id={selected}
          canReview={access.review}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
