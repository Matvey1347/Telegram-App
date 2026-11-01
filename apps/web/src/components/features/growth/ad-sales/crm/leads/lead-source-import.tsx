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
  Textarea,
} from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { leadKeys } from "@/lib/features/growth/lead-discovery-query";
export function LeadSourceImport({
  workspace,
  onClose,
}: {
  workspace: string;
  onClose: () => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"TEXT" | "CSV">("TEXT");
  const [reference, setReference] = useState("");
  const preview = useMutation({
    mutationFn: () => leadDiscoveryApi.preview({ text, format }),
    retry: false,
  });
  const commit = useMutation({
    mutationFn: () =>
      leadDiscoveryApi.importSources(
        (preview.data?.rows ?? [])
          .filter((v) => !v.error && !v.existingId)
          .map(
            (v) =>
              ({
                type: "TELEGRAM_CHANNEL",
                reference: v.reference,
                processingReference: reference.trim(),
              }) satisfies LeadSourceInput,
          ),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: leadKeys.sourcesRoot(workspace) }),
    retry: false,
  });
  const changeText = (next: string) => {
    setText(next);
    preview.reset();
    commit.reset();
  };
  return (
    <Modal open title={t("Import source list")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">
          {t(
            "At most 100 sources. Preview first; imports never join channels or enable monitoring.",
          )}
        </p>
        <FormField label={t("Format")}>
          <Select
            aria-label="Source import format"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as "TEXT" | "CSV");
              preview.reset();
            }}
          >
            <option value="TEXT">{t("Text list")}</option>
            <option value="CSV">CSV</option>
          </Select>
        </FormField>
        <FormField label={t("Source list")}>
          <Textarea
            aria-label={t("Source list")}
            rows={6}
            maxLength={32000}
            value={text}
            placeholder="@source_one&#10;https://t.me/source_two"
            onChange={(e) => changeText(e.target.value)}
          />
        </FormField>
        <FormField label={t("Approved processing reference")}>
          <Input
            aria-label="Import processing reference"
            value={reference}
            placeholder="policy:approved-source-record"
            maxLength={90}
            onChange={(e) => setReference(e.target.value)}
          />
        </FormField>
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          disabled={!text.trim() || preview.isPending || commit.isPending}
          onClick={() => preview.mutate()}
        >
          {t("Preview sources")}
        </Button>
        {preview.isError ? (
          <p role="alert">
            {t("Import preview failed. Check format and the 100-source limit.")}
          </p>
        ) : null}
        {preview.data ? (
          <div className="space-y-2">
            <p className="text-sm">Valid rows: {preview.data.validCount}</p>
            <ol className="max-h-64 space-y-2 overflow-y-auto text-xs">
              {preview.data.rows.map((v, i) => (
                <li
                  key={i}
                  className="break-words border-t border-neutral-800 pt-2"
                >
                  <strong>{v.reference}</strong>
                  <p className={v.error ? "text-rose-300" : "text-neutral-400"}>
                    {v.error ??
                      (v.existingId
                        ? "Already exists — skipped"
                        : "Ready for import")}
                  </p>
                </li>
              ))}
            </ol>
            <Button
              className="max-w-full !whitespace-normal"
              disabled={
                commit.isPending ||
                !preview.data.rows.some((v) => !v.error && !v.existingId) ||
                !/^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(
                  reference.trim(),
                )
              }
              onClick={() => commit.mutate()}
            >
              {t("Import valid new sources")}
            </Button>
          </div>
        ) : null}
        {commit.isError ? (
          <p role="alert">
            {t(
              "Import failed. Existing sources remain unchanged; retry explicitly.",
            )}
          </p>
        ) : null}
        {commit.data ? (
          <p role="status" className="text-sm">
            Created {commit.data.created} · Existing {commit.data.existing} ·
            Errors {commit.data.errors.length}
            {commit.data.errors.map((v) => (
              <span
                className="mt-1 block break-words text-amber-200"
                key={v.reference}
              >
                {v.reference}: {v.error}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
