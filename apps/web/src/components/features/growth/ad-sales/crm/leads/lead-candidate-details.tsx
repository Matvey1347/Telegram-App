"use client";
import { useLeadText } from "./lead-copy";
import { useQuery } from "@tanstack/react-query";
import type { LeadCandidateView } from "@telegram-system/shared";
import { LeadPreparation } from "./lead-preparation";
import { Button, Modal } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import {
  displayLeadDate,
  leadSafeUrl,
  leadBusinessContactUrl,
} from "./lead-utils";
import { LeadObservationCard } from "./lead-observation-card";
import { LeadCandidateActions } from "./lead-candidate-actions";
import { LeadQueryState } from "./lead-query-state";
export function LeadCandidateDetails({
  workspace,
  id,
  canReview,
  onClose,
}: {
  workspace: string;
  id: string;
  canReview: boolean;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: leadKeys.candidate(workspace, id),
    queryFn: ({ signal }) => leadDiscoveryApi.candidate(id, signal),
    ...leadQueryPolicy,
    staleTime: 0,
  });
  const c = query.data;
  return (
    <Modal
      open
      onClose={onClose}
      title={c?.title ?? "Candidate details"}
      size="xl"
    >
      <div className="space-y-4">
        <LeadQueryState
          loading={query.isLoading}
          error={query.isError}
          empty={false}
          onRetry={() => void query.refetch()}
        />
        {c ? (
          <>
            <LeadCandidateContent
              candidate={c}
              canReview={canReview}
              onReload={() => void query.refetch()}
            />
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export function LeadCandidateContent({
  candidate: c,
  canReview,
  onReload,
}: {
  candidate: LeadCandidateView;
  canReview: boolean;
  onReload: () => void;
}) {
  const t = useLeadText();
  const workspace = c.workspaceId;
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {c.niche || "Unknown niche"} · {c.offerType || "Unknown offer"} ·{" "}
            {c.reviewStatus} · {c.riskStatus}
          </p>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            onClick={onReload}
          >
            {t("Reload details")}
          </Button>
        </div>
        <p className="text-xs text-neutral-400">
          Retained until {displayLeadDate(c.expiresAt)} · Revision {c.revision}
        </p>
        {c.risks.length ? (
          <ul className="list-inside list-disc text-sm text-amber-200">
            {c.risks.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : null}
        <section className="space-y-2">
          <h3 className="font-semibold">{t("All linked sources")}</h3>
          {c.sources.map((v) => (
            <p key={v.id} className="text-sm">
              {leadSafeUrl(v.url) ? (
                <a
                  className="text-blue-300"
                  href={leadSafeUrl(v.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {v.title}
                </a>
              ) : (
                v.title
              )}
            </p>
          ))}
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">{t("Public business contacts")}</h3>
          {c.contacts.length ? (
            c.contacts.map((v, i) => (
              <div className="break-words text-sm" key={i}>
                <p>
                  {v.type} · {v.value} · {v.role} ·{" "}
                  {v.confirmed ? "Human confirmed" : "Unconfirmed"}
                </p>
                <p className="text-xs text-neutral-400">{v.evidence}</p>
                {leadBusinessContactUrl(v) ? (
                  <a
                    className="inline-flex min-h-10 items-center text-blue-300"
                    href={leadBusinessContactUrl(v)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Open business reference manually")}
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-neutral-400">
              {t("No verified business contact was found.")}
            </p>
          )}
        </section>
        {canReview ? (
          <LeadCandidateActions key={`${c.id}:${c.revision}`} candidate={c} />
        ) : null}
        <section className="space-y-3">
          <h3 className="font-semibold">{t("Advertisement evidence")}</h3>
          {c.observations.map((v) => (
            <div id={`lead-evidence-${encodeURIComponent(v.id)}`} key={v.id}>
              <LeadObservationCard
                observation={v}
                workspace={workspace}
                canReview={canReview}
              />
            </div>
          ))}
          {c.hasMoreObservations ? (
            <p className="text-sm text-amber-200">
              {t(
                "Additional evidence exists. Use the bounded source feed to inspect remaining materials; this detail view is truncated.",
              )}
            </p>
          ) : null}
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">{t("Review history")}</h3>
          {c.reviewHistory.length ? (
            c.reviewHistory.map((v, i) => (
              <p className="break-words text-xs text-neutral-400" key={i}>
                {displayLeadDate(v.at)} · {v.action} · Reviewer {v.actorUserId}
              </p>
            ))
          ) : (
            <p className="text-sm text-neutral-400">
              {t("No review action yet.")}
            </p>
          )}
        </section>
      </div>
      <LeadPreparation key={`${c.id}:${c.revision}`} candidate={c} />
    </div>
  );
}
