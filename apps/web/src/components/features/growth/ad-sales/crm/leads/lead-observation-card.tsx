"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LeadCandidateView,
  LeadObservationView,
} from "@telegram-system/shared";
import { Button, Card } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { aiMoney } from "@/components/features/operations/ai/ai-format";
import { displayLeadDate, leadSafeUrl } from "./lead-utils";
import { LeadManualCandidate } from "./lead-manual-candidate";
export function LeadObservationCard({
  observation,
  workspace,
  canReview,
  selected,
  onSelect,
}: {
  observation: LeadObservationView;
  workspace: string;
  canReview: boolean;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [manual, setManual] = useState(false);
  const review = useMutation({
    mutationFn: (status: "APPROVED" | "REJECTED") =>
      leadDiscoveryApi.reviewObservation(observation.id, status),
    onSuccess: async (result) => {
      await patchLeadEntity(client, leadKeys.feedRoot(workspace), result);
      client.setQueriesData<LeadCandidateView>(
        { queryKey: leadKeys.candidateRoot(workspace) },
        (old) =>
          old
            ? {
                ...old,
                observations: old.observations.map((v) =>
                  v.id === result.id ? result : v,
                ),
              }
            : old,
      );
      void client.invalidateQueries({
        queryKey: leadKeys.sourcesRoot(workspace),
      });
    },
    retry: false,
  });
  const c = observation.classification;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">
            {observation.sourceTitle}
          </h3>
          <p className="text-xs text-neutral-400">
            Published {displayLeadDate(observation.publishedAt)} · Observed{" "}
            {displayLeadDate(observation.observedAt)}
          </p>
        </div>
        {onSelect ? (
          <label className="flex min-h-10 items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label={`Select material ${observation.externalMessageId}`}
              checked={!!selected}
              onChange={(e) => onSelect(e.target.checked)}
            />
            {t("Analyze selection")}
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span>{c?.classification ?? "UNKNOWN"}</span>
        <span>Review: {observation.reviewStatus}</span>
        <span>Original: {observation.originalStatus}</span>
        <span>
          {c
            ? `Confidence ${Math.round(c.confidence * 100)}%`
            : "Not classified"}
        </span>
        <span>{observation.processingStatus}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-200">
        {observation.text}
      </p>
      <div className="mt-3 space-y-2 text-xs text-neutral-400">
        {c ? (
          <>
            <p>
              {c.niche || "Unknown niche"} · {c.offerType || "Unknown offer"} ·{" "}
              {c.relevance}
            </p>
            <p>{t("Commercial intent is not proof of paid placement.")}</p>
            <p>Classification evidence: {c.evidence.join(" · ") || "None"}</p>
            {c.risks.length ? (
              <p className="text-amber-200">
                Risk signals require human review: {c.risks.join(" · ")}
              </p>
            ) : null}
          </>
        ) : null}
        {observation.extraction?.contacts.map((v, i) => (
          <p className="break-words" key={i}>
            {v.type} · {v.value} · {v.role}
            <span className="block text-neutral-500">{v.evidence}</span>
          </p>
        ))}
        <p>
          Classification cost:{" "}
          {aiMoney(observation.classificationOperation?.actualCost ?? null)} ·{" "}
          {observation.classificationOperation?.pricingStatus ?? "UNKNOWN"}
        </p>
        <p>
          Extraction cost:{" "}
          {aiMoney(observation.extractionOperation?.actualCost ?? null)} ·{" "}
          {observation.extractionOperation?.pricingStatus ?? "UNKNOWN"}
        </p>
        <p>
          Classifier: {observation.classificationVersion ?? "Not analyzed"} ·
          Retained until {displayLeadDate(observation.expiresAt)}
        </p>
      </div>
      {leadSafeUrl(observation.messageUrl) &&
      !["DELETED", "ACCESS_LOST"].includes(observation.originalStatus) ? (
        <a
          href={leadSafeUrl(observation.messageUrl)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-10 items-center text-sm text-blue-300"
        >
          {t("Open original reference")}
        </a>
      ) : (
        <p className="mt-3 text-xs text-amber-200">
          {t(
            "The original is deleted, unavailable or not linked. Saved evidence is not a currently available original.",
          )}
        </p>
      )}
      {canReview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={
              review.isPending || observation.reviewStatus === "APPROVED"
            }
            onClick={() => review.mutate("APPROVED")}
          >
            {t("Approve evidence")}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={
              review.isPending || observation.reviewStatus === "REJECTED"
            }
            onClick={() => review.mutate("REJECTED")}
          >
            {t("Reject evidence")}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={
              observation.reviewStatus !== "APPROVED" ||
              !!observation.candidateId
            }
            onClick={() => setManual(true)}
          >
            {t("Create candidate manually")}
          </Button>
        </div>
      ) : null}
      {review.isError ? (
        <p role="alert" className="mt-2 text-sm text-amber-200">
          {t("Evidence review failed. Check current access and state.")}
        </p>
      ) : null}
      {manual ? (
        <LeadManualCandidate
          workspace={workspace}
          observation={observation.id}
          onClose={() => setManual(false)}
        />
      ) : null}
    </Card>
  );
}
