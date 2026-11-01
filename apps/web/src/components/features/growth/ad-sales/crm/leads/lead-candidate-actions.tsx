"use client";
import { useLeadText } from "./lead-copy";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LeadCandidateView,
  LeadCandidateReviewInput,
  LeadRiskStatus,
} from "@telegram-system/shared";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { LeadCandidatePicker } from "./lead-candidate-picker";
import { LeadContactPicker } from "./lead-contact-picker";
export function LeadCandidateActions({
  candidate,
}: {
  candidate: LeadCandidateView;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState<number[]>(
    candidate.contacts.flatMap((v, i) => (v.confirmed ? [i] : [])),
  );
  const [risk, setRisk] = useState<LeadRiskStatus>(candidate.riskStatus);
  const [name, setName] = useState(candidate.title);
  const [link, setLink] = useState(false);
  const [contact, setContact] = useState("");
  const [merge, setMerge] = useState(false);
  const [alias, setAlias] = useState("");
  const [same, setSame] = useState(false);
  const mutation = useMutation({
    mutationFn: (action: LeadCandidateReviewInput["action"]) =>
      leadDiscoveryApi.reviewCandidate(candidate.id, {
        revision: candidate.revision,
        action,
        confirmedContactIndexes: confirmed,
        riskStatus: risk,
        ...(action === "LINK" ? { contactId: contact } : {}),
        ...(action === "CREATE_CLIENT" ? { displayName: name.trim() } : {}),
        ...(action === "MERGE" ? { mergeIntoId: alias } : {}),
      }),
    onSuccess: async (result) => {
      await patchLeadEntity(
        client,
        leadKeys.candidatesRoot(candidate.workspaceId),
        result,
      );
      client.setQueryData(
        leadKeys.candidate(candidate.workspaceId, candidate.id),
        result,
      );
      void client.invalidateQueries({
        queryKey: leadKeys.queueRoot(candidate.workspaceId),
      });
      void client.invalidateQueries({
        queryKey: leadKeys.preparation(candidate.workspaceId, candidate.id),
        exact: true,
      });
      void client.invalidateQueries({
        queryKey: leadKeys.sourcesRoot(candidate.workspaceId),
      });
      if (result.contactId)
        void client.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
          refetchType: "active",
        });
    },
    retry: false,
  });
  const businessConfirmed = candidate.contacts.some(
    (v) => v.confirmed && ["ADVERTISER", "SALES_CONTACT"].includes(v.role),
  );
  const approved =
    candidate.reviewStatus === "APPROVED" &&
    candidate.riskStatus === "ACCEPTABLE";
  return (
    <div className="space-y-3 border-t border-neutral-800 pt-4">
      <h3 className="font-semibold">{t("Human review & CRM")}</h3>
      <p className="text-xs text-neutral-400">
        {t(
          "Confirm each public business contact and its role from evidence. A destination link does not prove ownership. Risk signals are not a fraud verdict.",
        )}
      </p>
      <div className="space-y-2">
        {candidate.contacts.map((v, i) => (
          <label key={i} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed.includes(i)}
              onChange={(e) =>
                setConfirmed(
                  e.target.checked
                    ? [...confirmed, i]
                    : confirmed.filter((n) => n !== i),
                )
              }
            />
            <span className="min-w-0 break-words">
              {v.type} · {v.value} · {v.role}
              <span className="block text-xs text-neutral-400">
                {v.evidence}
              </span>
            </span>
          </label>
        ))}
      </div>
      <FormField label={t("Reviewed risk status")}>
        <Select
          aria-label={t("Reviewed risk status")}
          value={risk}
          onChange={(e) => setRisk(e.target.value as LeadRiskStatus)}
        >
          {["NEEDS_REVIEW", "ACCEPTABLE", "SUSPICIOUS", "REJECTED"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          className="max-w-full !whitespace-normal"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("APPROVE")}
        >
          {t("Approve candidate")}
        </Button>
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("REJECT")}
        >
          {t("Reject candidate")}
        </Button>
      </div>
      {candidate.contactId ? (
        <Link
          href={`/ad-sales/clients/${encodeURIComponent(candidate.contactId)}`}
          className="inline-flex min-h-10 items-center text-sm text-blue-300"
        >
          {t("Open linked CRM client →")}
        </Link>
      ) : (
        <>
          <p className="text-xs text-neutral-400">
            {t(
              "CRM creation/linking requires an approved acceptable candidate and a confirmed advertiser or sales contact. No conversation or outreach is created.",
            )}
          </p>
          <FormField label={t("CRM client name")}>
            <Input
              aria-label={t("CRM client name")}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button
              className="max-w-full !whitespace-normal"
              variant="secondary"
              disabled={
                !approved ||
                !businessConfirmed ||
                !name.trim() ||
                mutation.isPending
              }
              onClick={() => mutation.mutate("CREATE_CLIENT")}
            >
              {t("Create CRM client")}
            </Button>
            <Button
              className="max-w-full !whitespace-normal"
              variant="secondary"
              disabled={!approved || !businessConfirmed}
              onClick={() => setLink(!link)}
            >
              {t("Link existing CRM client")}
            </Button>
          </div>
          {link ? (
            <div className="space-y-3">
              <LeadContactPicker
                workspace={candidate.workspaceId}
                value={contact}
                onChange={setContact}
              />
              <Button
                className="max-w-full !whitespace-normal"
                disabled={!contact || mutation.isPending}
                onClick={() => mutation.mutate("LINK")}
              >
                {t("Confirm client link")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <Button
        className="max-w-full !whitespace-normal"
        variant="secondary"
        onClick={() => setMerge(!merge)}
        aria-expanded={merge}
      >
        Review duplicate merge
      </Button>
      {merge ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">
            Possible aliases — manual decision only
          </h4>
          {candidate.aliases.map((v) => (
            <p className="text-xs text-neutral-400" key={v.id}>
              {v.title} · {v.reason}
            </p>
          ))}
          <LeadCandidatePicker
            workspace={candidate.workspaceId}
            current={candidate.id}
            value={alias}
            onChange={(id) => {
              setAlias(id);
              setSame(false);
            }}
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={same}
              onChange={(e) => setSame(e.target.checked)}
            />
            I verified these records represent the same advertiser
          </label>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={!alias || !same || mutation.isPending}
            onClick={() => mutation.mutate("MERGE")}
          >
            Merge reviewed duplicate
          </Button>
        </div>
      ) : null}

      {mutation.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t(
            "Review failed. Permissions, revision, evidence or CRM linkage may have changed. Reload details before retrying.",
          )}
        </p>
      ) : null}
    </div>
  );
}
