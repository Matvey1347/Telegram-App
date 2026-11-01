"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadMaterialInput } from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { invalidateLeadResults } from "@/lib/features/growth/lead-discovery-query";
type MaterialRow = {
  externalMessageId: string;
  text: string;
  date: string;
  time: string;
  messageUrl: string;
};
const empty = (): MaterialRow => ({
  externalMessageId: "",
  text: "",
  date: new Date().toISOString().slice(0, 10),
  time: "12:00",
  messageUrl: "",
});
export function materialRows(rows: MaterialRow[]): LeadMaterialInput[] {
  if (!rows.length || rows.length > 20) throw new Error("Batch limit");
  return rows.map((v) => {
    const publishedAt = new Date(`${v.date}T${v.time}:00Z`);
    if (
      !/^[A-Za-z0-9_.:-]{1,120}$/.test(v.externalMessageId.trim()) ||
      !v.text.trim() ||
      v.text.length > 4096 ||
      !Number.isFinite(publishedAt.getTime()) ||
      publishedAt.toISOString().slice(0, 16) !== `${v.date}T${v.time}`
    )
      throw new Error("Invalid material");
    return {
      externalMessageId: v.externalMessageId.trim(),
      text: v.text,
      publishedAt: publishedAt.toISOString(),
      ...(v.messageUrl.trim() ? { messageUrl: v.messageUrl.trim() } : {}),
    };
  });
}
export function LeadMaterialImport({
  workspace,
  source,
  onClose,
}: {
  workspace: string;
  source: string;
  onClose: () => void;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [rows, setRows] = useState([empty()]);
  const [validation, setValidation] = useState(false);
  const update = (i: number, patch: Partial<MaterialRow>) =>
    setRows(rows.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  const mutation = useMutation({
    mutationFn: (items: LeadMaterialInput[]) =>
      leadDiscoveryApi.materials(source, items),
    onSuccess: () => invalidateLeadResults(client, workspace),
    retry: false,
  });
  return (
    <Modal open title={t("Import permitted materials")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const items = materialRows(rows);
            setValidation(false);
            mutation.mutate(items);
          } catch {
            setValidation(true);
          }
        }}
      >
        <p className="text-sm text-neutral-400">
          {t(
            "Up to 20 text materials from an approved source. No media downloads, AI calls or messages are triggered.",
          )}
        </p>
        {rows.map((row, i) => (
          <fieldset
            key={i}
            className="space-y-3 border-t border-neutral-800 pt-3"
          >
            <legend className="text-sm">Material {i + 1}</legend>
            <FormField label={t("External message ID")}>
              <Input
                aria-label={`Material ${i + 1} message ID`}
                value={row.externalMessageId}
                maxLength={120}
                onChange={(e) =>
                  update(i, { externalMessageId: e.target.value })
                }
              />
            </FormField>
            <FormField label={t("Permitted source text")}>
              <Textarea
                aria-label={`Material ${i + 1} text`}
                value={row.text}
                maxLength={4096}
                rows={4}
                onChange={(e) => update(i, { text: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("Published date (UTC)")}>
                <DateInput
                  aria-label={`Material ${i + 1} date`}
                  value={row.date}
                  onChange={(e) => update(i, { date: e.target.value })}
                />
              </FormField>
              <FormField label={t("Time (UTC)")}>
                <Input
                  type="time"
                  aria-label={`Material ${i + 1} time`}
                  value={row.time}
                  onChange={(e) => update(i, { time: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label={t("Original message link (optional)")}>
              <Input
                aria-label={`Material ${i + 1} original link`}
                value={row.messageUrl}
                maxLength={500}
                onChange={(e) => update(i, { messageUrl: e.target.value })}
              />
            </FormField>
            {rows.length > 1 ? (
              <Button
                className="max-w-full !whitespace-normal"
                variant="secondary"
                type="button"
                onClick={() => setRows(rows.filter((_, n) => n !== i))}
              >
                {t("Remove material")}
              </Button>
            ) : null}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            type="button"
            disabled={rows.length >= 20 || mutation.isPending}
            onClick={() => setRows([...rows, empty()])}
          >
            {t("Add material")}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            type="submit"
            disabled={mutation.isPending}
          >
            {t("Import materials")}
          </Button>
        </div>
        {validation ? (
          <p role="alert">
            {t(
              "Provide a valid message ID, text and UTC publication date for every material.",
            )}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert">
            {t(
              "Materials were not imported. Check source grants, limits and original identities.",
            )}
          </p>
        ) : null}
        {mutation.data ? (
          <p role="status">
            Changed {mutation.data.changed} · Unchanged{" "}
            {mutation.data.unchanged} · Filtered {mutation.data.filtered} ·{" "}
            {mutation.data.gap ? "Coverage gap remains" : "No gap reported"}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
