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
} from "./lead-utils";
import { candidateContactCategory, contactCategoryLabel, contactDescription, publicLeadUrl } from "./lead-candidate-presentation";
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
  simplified = false,
}: {
  candidate: LeadCandidateView;
  canReview: boolean;
  onReload: () => void;
  simplified?: boolean;
}) {
  const t = useLeadText();
  const workspace = c.workspaceId;
  if (simplified) return <section aria-label={t("Advertisement evidence")} className="space-y-3">
    {c.observations.map((v) => {
      const links = [...new Set([...v.links, ...(v.targetEvidence ?? []).map((item) => item.value)])].map(leadSafeUrl).filter((url): url is string => Boolean(url));
      return <article id={`lead-evidence-${encodeURIComponent(v.id)}`} key={v.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">{v.text || t("Advertisement evidence")}</p>
        {links.length ? <div className="mt-3 flex flex-wrap gap-2">{links.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-neutral-700 px-3 text-sm text-blue-300 hover:bg-neutral-900">{url.includes("t.me/") || url.includes("telegram.me/") ? "Telegram" : url}</a>)}</div> : null}
        {leadSafeUrl(v.messageUrl) ? <a className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500" href={leadSafeUrl(v.messageUrl)} target="_blank" rel="noreferrer">{t("Open publication")}</a> : null}
      </article>;
    })}
    {!c.observations.length ? <p className="text-sm text-neutral-400">{t("No publications found")}</p> : null}
  </section>;
  return (
    <div className={simplified ? "min-w-0" : "grid min-w-0 gap-4 xl:grid-cols-2"}>
      <div className="min-w-0 space-y-4">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!simplified ? <p className="text-sm">
            {c.niche || "Unknown niche"} · {c.offerType || "Unknown offer"} ·{" "}
            {c.reviewStatus} · {c.riskStatus}
          </p> : null}
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            onClick={onReload}
          >
            {t("Reload details")}
          </Button>
        </div>
        {!simplified ? <p className="text-xs text-neutral-400">
          Retained until {displayLeadDate(c.expiresAt)} · Revision {c.revision}
        </p> : null}
        {!simplified && c.risks.length ? (
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
          {!simplified ? <p className="text-sm text-blue-200">{contactCategoryLabel[candidateContactCategory(c)]} · {candidateContactCategory(c)}</p> : null}
          {c.contacts.length ? (
            c.contacts.map((v, i) => (
              <div className="break-words text-sm" key={i}>
                <p>
                  {simplified ? v.value : `${contactDescription(v)} · ${v.value} · ${v.confirmed ? "Подтверждено человеком" : "Требует ручной проверки"}`}
                </p>
                {!simplified ? <p className="text-xs text-neutral-400">Основание: {v.evidence} {v.evidenceSource ? `· ${v.evidenceSource}` : ""}</p> : null}
                {!simplified && leadSafeUrl(v.evidenceUrl ?? null) ? <a className="text-xs text-blue-300" href={leadSafeUrl(v.evidenceUrl ?? null)} target="_blank" rel="noreferrer">Открыть источник контакта</a> : null}
                {publicLeadUrl(v) ? (
                  <a
                    className="inline-flex min-h-10 items-center text-blue-300"
                    href={publicLeadUrl(v)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть публичную ссылку
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
        {canReview && !simplified ? (
          <LeadCandidateActions key={`${c.id}:${c.revision}`} candidate={c} />
        ) : null}
        <section className="space-y-3">
          <h3 className="font-semibold">{t("Advertisement evidence")}</h3>
          {c.observations.map((v) => (
            <div id={`lead-evidence-${encodeURIComponent(v.id)}`} key={v.id}>
              {simplified ? <div className="rounded-lg border border-neutral-800 p-4 text-sm"><p className="font-medium">{v.sourceTitle}</p><p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-neutral-300">{v.text}</p>{leadSafeUrl(v.messageUrl) ? <a className="mt-2 inline-block text-blue-300" href={leadSafeUrl(v.messageUrl)} target="_blank" rel="noreferrer">Открыть публикацию</a> : null}</div> : <LeadObservationCard observation={v} workspace={workspace} canReview={canReview} />}
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
        {!simplified ? <section className="space-y-2">
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
        </section> : null}
      </div>
      {!simplified ? <LeadPreparation key={`${c.id}:${c.revision}`} candidate={c} /> : null}
    </div>
  );
}
