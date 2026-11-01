"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmCopilotLanguage,
  CrmCopilotTone,
  LeadCandidateView,
  LeadCandidateDraftView,
  LeadCandidateDraftPatch,
  LeadPreparationView,
} from "@telegram-system/shared";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import {
  leadKeys,
  leadQueryPolicy,
  patchLeadPreparation,
} from "@/lib/features/growth/lead-discovery-query";
import { LeadPreparationProducts } from "./lead-preparation-products";
import { LeadPreparationScore } from "./lead-preparation-score";
import { ManualOfferReport } from "../manual/manual-offer-report";
import { LeadCandidateDraft } from "./lead-candidate-draft";
import { useQualificationText } from "./qualification-copy";
export function LeadPreparation({
  candidate,
}: {
  candidate: LeadCandidateView;
}) {
  const t = useQualificationText();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: leadKeys.preparation(candidate.workspaceId, candidate.id),
    queryFn: ({ signal }) => leadPreparationApi.get(candidate.id, signal),
    ...leadQueryPolicy,
    staleTime: 0,
  });
  const [productIds, setProductIds] = useState<string[] | null>(null);
  const [tone, setTone] = useState<CrmCopilotTone>("NATURAL");
  const [language, setLanguage] = useState<CrmCopilotLanguage>("uk");
  const [riskReview, setRiskReview] = useState({
    qualification: "",
    acknowledged: false,
    note: "",
  });
  const p = query.data;
  const products = productIds ?? p?.products.map((v) => v.id) ?? [];
  const mutation = useMutation({
    mutationFn: (action: () => Promise<LeadPreparationView>) => action(),
    retry: false,
    onSuccess: async (view) => {
      await Promise.all([
        client.cancelQueries({
          queryKey: leadKeys.preparation(candidate.workspaceId, candidate.id),
          exact: true,
        }),
        client.cancelQueries({
          queryKey: leadKeys.queueRoot(candidate.workspaceId),
        }),
      ]);
      const prior = client.getQueryData<LeadPreparationView>(
        leadKeys.preparation(candidate.workspaceId, candidate.id),
      );
      if (
        prior?.qualification?.contextVersion !==
        view.qualification?.contextVersion
      ) {
        setRiskReview({ qualification: "", acknowledged: false, note: "" });
      }
      patchLeadPreparation(client, candidate.workspaceId, view);
    },
  });
  const q = p?.qualification;
  const reviewKey = q ? `${q.id}:${q.contextVersion}` : "";
  const acknowledge =
    riskReview.qualification === reviewKey && riskReview.acknowledged;
  const note = riskReview.qualification === reviewKey ? riskReview.note : "";
  const highRisk = q?.score?.riskLevel === "RISK_HIGH";
  const changedProducts =
    !!p &&
    [...products].sort().join(",") !==
      p.products
        .map((v) => v.id)
        .sort()
        .join(",");
  const decide = (decision: "QUALIFIED" | "LOW_RELEVANCE" | "NEEDS_REVIEW") => {
    if (!q) return;
    mutation.mutate(async () => {
      const result = await leadPreparationApi.decide(candidate.id, {
        revision: candidate.revision,
        qualificationId: q.id,
        contextVersion: q.contextVersion,
        decision,
        acknowledgeHighRisk: acknowledge,
        note: note.trim() || undefined,
      });
      void client.invalidateQueries({
        queryKey: leadKeys.candidate(candidate.workspaceId, candidate.id),
        exact: true,
      });
      void client.invalidateQueries({
        queryKey: leadKeys.sourcesRoot(candidate.workspaceId),
      });
      return result;
    });
  };
  const patch = (
    draft: LeadCandidateDraftView,
    action: LeadCandidateDraftPatch["action"],
    text?: string,
  ) =>
    mutation.mutate(() =>
      leadPreparationApi.updateDraft(candidate.id, draft.id, {
        revision: draft.revision,
        action,
        text,
      }),
    );
  const copy = async (draft: LeadCandidateDraftView) => {
    const current = await leadPreparationApi.get(candidate.id);
    await client.cancelQueries({
      queryKey: leadKeys.preparation(candidate.workspaceId, candidate.id),
      exact: true,
    });
    patchLeadPreparation(client, candidate.workspaceId, current);
    const found = current.drafts.find(
      (v) => v.id === draft.id && v.revision === draft.revision && v.canCopy,
    );
    if (!found) throw new Error("APPROVAL_CHANGED");
    await navigator.clipboard.writeText(found.text);
  };
  return (
    <aside
      className="min-w-0 space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/55 p-4"
      aria-label={t("Qualification and first offer")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("Qualification and first offer")}</h3>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t("Reload")}
        </Button>
      </header>
      {query.isLoading ? (
        <p role="status">{t("Loading qualification…")}</p>
      ) : null}
      {query.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t("Preparation unavailable. Check workspace permissions and retry.")}
        </p>
      ) : null}
      {p ? (
        <>
          <p className="text-xs text-neutral-400">
            {p.workflowState} · {t("Human decision")}{" "}
            {p.qualificationDecision ?? "—"}
          </p>
          {!p.enabled || p.blockedReason ? (
            <p role="status" className="break-words text-xs text-amber-200">
              {t(
                "Preparation is gated by current permissions, evidence, source policy and budget.",
              )}{" "}
              {p.blockedReason}
            </p>
          ) : null}
          <LeadPreparationProducts
            workspace={candidate.workspaceId}
            value={products}
            onChange={setProductIds}
            selected={p.products}
          />
          <Button
            className="w-full !whitespace-normal"
            disabled={mutation.isPending || query.isError || !p.canQualify}
            onClick={() =>
              mutation.mutate(() =>
                leadPreparationApi.qualify(candidate.id, {
                  operationId: crypto.randomUUID(),
                  productIds: products,
                }),
              )
            }
          >
            {t("Qualify explicitly with AI")}
          </Button>
          <p className="text-xs text-neutral-400">
            {t(
              "Qualification and message generation are separate budgeted actions. Opening this card calls no AI.",
            )}
          </p>
          {q ? (
            <LeadPreparationScore value={q} />
          ) : (
            <p className="text-sm text-neutral-400">
              {t(
                "No qualification yet. Confirm the business contact and inspect evidence first.",
              )}
            </p>
          )}
          {p.canReview && q?.status === "READY" ? (
            <fieldset
              className="space-y-3 border-t border-neutral-800 pt-3"
              disabled={mutation.isPending || query.isError || changedProducts}
            >
              <legend className="text-sm font-semibold">
                {t("Manager qualification decision")}
              </legend>
              {highRisk ? (
                <>
                  <label className="flex min-h-11 items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acknowledge}
                      onChange={(e) =>
                        setRiskReview({
                          qualification: reviewKey,
                          acknowledged: e.target.checked,
                          note,
                        })
                      }
                    />
                    <span>
                      {t(
                        "I reviewed the high-risk evidence and take responsibility for this separate decision.",
                      )}
                    </span>
                  </label>
                  <FormField label={t("Risk review note")}>
                    <Input
                      value={note}
                      maxLength={500}
                      onChange={(e) =>
                        setRiskReview({
                          qualification: reviewKey,
                          acknowledged: acknowledge,
                          note: e.target.value,
                        })
                      }
                      aria-label={t("Risk review note")}
                    />
                  </FormField>
                </>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    highRisk && (!acknowledge || note.trim().length < 10)
                  }
                  onClick={() => decide("QUALIFIED")}
                >
                  {t("Confirm qualified")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => decide("LOW_RELEVANCE")}
                >
                  {t("Low relevance")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => decide("NEEDS_REVIEW")}
                >
                  {t("Needs review")}
                </Button>
              </div>
            </fieldset>
          ) : null}
          <section className="space-y-3 border-t border-neutral-800 pt-3">
            <h4 className="font-semibold">{t("Personalized first offer")}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t("Tone")}>
                <Select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as CrmCopilotTone)}
                  aria-label={t("Candidate draft tone")}
                >
                  {["NATURAL", "CONSULTATIVE", "DIRECT"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t("Language")}>
                <Select
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as CrmCopilotLanguage)
                  }
                  aria-label={t("Candidate draft language")}
                >
                  <option value="uk">Українська</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </Select>
              </FormField>
            </div>
            <Button
              className="w-full !whitespace-normal"
              disabled={
                mutation.isPending ||
                query.isError ||
                !p.canGenerateDraft ||
                changedProducts
              }
              onClick={() =>
                mutation.mutate(() =>
                  leadPreparationApi.generate(candidate.id, {
                    operationId: crypto.randomUUID(),
                    productIds: products,
                    tone,
                    language,
                  }),
                )
              }
            >
              {t("Generate first offer")}
            </Button>
            {changedProducts ? (
              <p className="text-xs text-amber-200">
                {t(
                  "Product selection changed. Qualify and review this context before generating.",
                )}
              </p>
            ) : null}
            {p.drafts.map((d) => (
              <div
                key={`${d.id}:${d.revision}:${d.status}`}
                className="min-w-0 space-y-3"
              >
                <LeadCandidateDraft
                  key={`${d.id}:${d.revision}:${d.status}`}
                  draft={d}
                  pending={mutation.isPending || query.isError}
                  onPatch={(action, text) => patch(d, action, text)}
                  onCopy={() => copy(d)}
                />
                {candidate.contactId &&
                candidate.contacts.some(
                  (v) => v.type === "INSTAGRAM" && v.confirmed,
                ) ? (
                  <ManualOfferReport
                    workspace={candidate.workspaceId}
                    contactId={candidate.contactId}
                    candidateId={candidate.id}
                    draft={d}
                  />
                ) : null}
              </div>
            ))}
          </section>
        </>
      ) : null}
      {mutation.isPending ? (
        <p role="status" className="text-xs text-neutral-400">
          {t("Saving or preparing… Please wait; no automatic retry.")}
        </p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t(
            "Action failed. Check current evidence, identity, source grant, budget and revision. Reload before retrying.",
          )}
        </p>
      ) : null}
    </aside>
  );
}
