"use client";
import Link from "next/link";
import type { LeadCandidateDraftView } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { crmManualApi } from "@/lib/features/growth/crm-manual-api";
import { useManualWorkflow } from "./use-manual-workflow";
export function ManualOfferReport({
  workspace,
  contactId,
  candidateId,
  draft,
}: {
  workspace: string;
  contactId: string;
  candidateId: string;
  draft: LeadCandidateDraftView;
}) {
  const { query, mutation, run } = useManualWorkflow(workspace, contactId);
  const payload = {
    action: "OFFER_SENT" as const,
    candidateId,
    draftId: draft.id,
    draftRevision: draft.revision,
  };
  return (
    <section className="space-y-2 border-t border-neutral-800 pt-3">
      <Button
        className="max-w-full !whitespace-normal"
        variant="secondary"
        disabled={
          mutation.isPending ||
          !query.data?.canEdit ||
          !query.data.commercialOutreachAllowed ||
          !draft.canCopy
        }
        onClick={() =>
          void run(JSON.stringify(payload), (operationId) =>
            crmManualApi.activity(contactId, { ...payload, operationId }),
          ).catch(() => {})
        }
      >
        I sent this approved offer manually
      </Button>
      <p className="text-xs text-neutral-400">
        A manual report does not confirm Instagram delivery or reading.
      </p>
      {mutation.isSuccess ? (
        <p role="status" className="text-xs text-emerald-300">
          Manual offer report saved.
        </p>
      ) : null}
      {mutation.isError || query.isError ? (
        <p role="alert" className="text-xs text-amber-200">
          Manual report unavailable. Check current ownership, DNC, source and
          draft approval; retry safely.
        </p>
      ) : null}
      <Link
        className="inline-flex min-h-11 items-center text-sm text-blue-300"
        href={`/ad-sales/clients/${encodeURIComponent(contactId)}?manual=1`}
      >
        Open manual client and follow-up
      </Link>
    </section>
  );
}
