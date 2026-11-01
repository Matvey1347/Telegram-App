"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadContact } from "@telegram-system/shared";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { invalidateLeadResults } from "@/lib/features/growth/lead-discovery-query";
export function LeadManualCandidate({
  workspace,
  observation,
  onClose,
}: {
  workspace: string;
  observation: string;
  onClose: () => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [contact, setContact] = useState<LeadContact>({
    type: "TELEGRAM",
    value: "",
    role: "UNKNOWN",
    evidence: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      leadDiscoveryApi.createCandidate(observation, {
        title: title.trim(),
        contacts: contact.value.trim()
          ? [{ ...contact, value: contact.value.trim() }]
          : [],
      }),
    onSuccess: async () => {
      await invalidateLeadResults(client, workspace);
      onClose();
    },
    retry: false,
  });
  return (
    <Modal open title={t("Create a candidate from evidence")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">
          {t(
            "Manual fallback uses this approved material only. No AI call, CRM client or commercial conversation is created.",
          )}
        </p>
        <FormField label={t("Advertiser / project title")}>
          <Input
            aria-label="Candidate title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField label={t("Public business contact type (optional)")}>
          <Select
            aria-label="Business contact type"
            value={contact.type}
            onChange={(e) =>
              setContact({
                ...contact,
                type: e.target.value as LeadContact["type"],
              })
            }
          >
            {[
              "TELEGRAM",
              "INSTAGRAM",
              "WEBSITE",
              "PUBLIC_BUSINESS_CONTACT",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Public contact value")}>
          <Input
            aria-label={t("Public contact value")}
            value={contact.value}
            maxLength={300}
            onChange={(e) => setContact({ ...contact, value: e.target.value })}
          />
        </FormField>
        <FormField label={t("Contact role")}>
          <Select
            aria-label={t("Contact role")}
            value={contact.role}
            onChange={(e) =>
              setContact({
                ...contact,
                role: e.target.value as LeadContact["role"],
              })
            }
          >
            {[
              "ADVERTISED_DESTINATION",
              "ADVERTISER",
              "SALES_CONTACT",
              "AGENCY",
              "UNKNOWN",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Evidence for the contact")}>
          <Textarea
            aria-label="Contact evidence"
            value={contact.evidence}
            maxLength={500}
            rows={3}
            onChange={(e) =>
              setContact({ ...contact, evidence: e.target.value })
            }
          />
        </FormField>
        <p className="text-xs text-neutral-400">
          {t(
            "A channel link is not automatically the advertiser or sales contact. Instagram is a manual business reference only.",
          )}
        </p>
        <Button
          className="max-w-full !whitespace-normal"
          disabled={
            mutation.isPending ||
            !title.trim() ||
            (!!contact.value.trim() && !contact.evidence.trim())
          }
          onClick={() => mutation.mutate()}
        >
          {t("Create review candidate")}
        </Button>
        {mutation.isError ? (
          <p role="alert">
            {t(
              "Candidate could not be created. Confirm source eligibility, evidence approval and contact syntax.",
            )}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
