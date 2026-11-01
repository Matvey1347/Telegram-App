"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadSourceView } from "@telegram-system/shared";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  patchLeadEntity,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
export function LeadSourceSettings({
  source,
  onClose,
}: {
  source: LeadSourceView;
  onClose: () => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [reference, setReference] = useState(source.processingReference);
  const [account, setAccount] = useState(source.accountId ?? "");
  const accounts = useQuery({
    queryKey: leadKeys.accounts(source.workspaceId),
    queryFn: leadDiscoveryApi.accounts,
    enabled:
      source.type === "TELEGRAM_CHANNEL" && source.monitoringState !== "ACTIVE",
    ...leadQueryPolicy,
  });
  const [own, setOwn] = useState(source.allowOwnChannel);
  const mutation = useMutation({
    mutationFn: () =>
      leadDiscoveryApi.updateSource(source.id, {
        processingReference: reference.trim(),
        allowOwnChannel: own,
        ...(account ? { accountId: account } : {}),
      }),
    onSuccess: async (result) => {
      await patchLeadEntity(
        client,
        leadKeys.sourcesRoot(source.workspaceId),
        result,
      );
      onClose();
    },
    retry: false,
  });
  return (
    <Modal open title={t("Source processing settings")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">
          {t(
            "A reference does not create a grant. Deployment-reviewed source/workspace/account permissions and expiry remain authoritative.",
          )}
        </p>
        <FormField label={t("Approved processing reference")}>
          <Input
            aria-label="Source processing reference"
            value={reference}
            maxLength={90}
            onChange={(e) => setReference(e.target.value)}
          />
        </FormField>
        {source.type === "TELEGRAM_CHANNEL" ? (
          <FormField label="Existing live account">
            <Select
              aria-label="Source account"
              value={account}
              disabled={source.monitoringState === "ACTIVE"}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">No account selected</option>
              {account && !accounts.data?.some((v) => v.id === account) ? (
                <option value={account}>Current account</option>
              ) : null}
              {accounts.data?.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.live}>
                  {v.label}
                  {v.live ? "" : " · not live"}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-neutral-400">
              Pause the source before changing its account. Validate access
              again before enabling monitoring.
            </p>
          </FormField>
        ) : null}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={own}
            onChange={(e) => setOwn(e.target.checked)}
          />
          {t("I deliberately allow this own channel for an approved use case")}
        </label>
        <Button
          className="max-w-full !whitespace-normal"
          disabled={
            mutation.isPending ||
            !/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(reference.trim())
          }
          onClick={() => mutation.mutate()}
        >
          {t("Save source settings")}
        </Button>
        {mutation.isError ? (
          <p role="alert">{t("Source settings could not be saved.")}</p>
        ) : null}
      </div>
    </Modal>
  );
}
