"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadSourceInput } from "@telegram-system/shared";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { leadKeys } from "@/lib/features/growth/lead-discovery-query";
import { LeadChannelPicker } from "./lead-channel-picker";
export function LeadSourceForm({
  workspace,
  onClose,
}: {
  workspace: string;
  onClose: () => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [value, setValue] = useState<LeadSourceInput>({
    type: "TELEGRAM_CHANNEL",
    reference: "",
    title: "",
    processingReference: "",
    allowOwnChannel: false,
  });
  const mutation = useMutation({
    mutationFn: () =>
      leadDiscoveryApi.addSource({
        ...value,
        reference: value.reference.trim(),
        processingReference: value.processingReference.trim(),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: leadKeys.sourcesRoot(workspace),
      });
      onClose();
    },
    retry: false,
  });
  const valid =
    !!value.reference.trim() &&
    /^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(
      value.processingReference.trim(),
    );
  return (
    <Modal open title={t("Add lead source")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !mutation.isPending) mutation.mutate();
        }}
      >
        <p className="text-sm text-neutral-400">
          {t(
            "New sources are reviewed and validated before monitoring. No automatic channel join or AI analysis.",
          )}
        </p>
        <FormField label={t("Source type")}>
          <Select
            aria-label={t("Source type")}
            value={value.type}
            onChange={(e) =>
              setValue({
                ...value,
                type: e.target.value as LeadSourceInput["type"],
              })
            }
          >
            <option value="TELEGRAM_CHANNEL">{t("Telegram channel")}</option>
            <option value="MANUAL_IMPORT">{t("Manual material source")}</option>
          </Select>
        </FormField>
        <FormField
          label={
            value.type === "MANUAL_IMPORT"
              ? "Manual source label"
              : "Username, Telegram link or supported identifier"
          }
        >
          <Input
            aria-label="Source reference"
            value={value.reference}
            maxLength={value.type === "MANUAL_IMPORT" ? 100 : 200}
            onChange={(e) => setValue({ ...value, reference: e.target.value })}
          />
        </FormField>
        <FormField label={t("Source title")}>
          <Input
            aria-label={t("Source title")}
            value={value.title}
            maxLength={160}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </FormField>
        <FormField label={t("Approved processing reference")}>
          <Input
            aria-label={t("Approved processing reference")}
            placeholder="policy:approved-source-record"
            value={value.processingReference}
            maxLength={90}
            onChange={(e) =>
              setValue({ ...value, processingReference: e.target.value })
            }
          />
        </FormField>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.allowOwnChannel}
            onChange={(e) =>
              setValue({ ...value, allowOwnChannel: e.target.checked })
            }
          />
          {t("I deliberately allow this own channel for an approved use case")}
        </label>
        {value.type === "TELEGRAM_CHANNEL" ? (
          <LeadChannelPicker
            workspace={workspace}
            allowOwn={!!value.allowOwnChannel}
            onAccount={(accountId) =>
              setValue({ ...value, accountId: accountId || undefined })
            }
            onChoose={(reference, title, accountId) =>
              setValue({ ...value, reference, title, accountId })
            }
          />
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-rose-300">
            {t(
              "Source could not be added. Check reference, grants and access.",
            )}
          </p>
        ) : null}
        <Button
          className="max-w-full !whitespace-normal"
          type="submit"
          disabled={!valid || mutation.isPending}
        >
          {mutation.isPending ? "Adding…" : "Add source for review"}
        </Button>
      </form>
    </Modal>
  );
}
