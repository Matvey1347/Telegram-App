"use client";
import { useState } from "react";
import { useAiText } from "./ai-copy";
import {
  AI_CATEGORIES,
  AI_OPERATION_STATUSES,
  type AiUsageFilter,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { aiCategory } from "./ai-format";
export function AiFilters({
  filter,
  onChange,
}: {
  filter: AiUsageFilter;
  onChange: (next: AiUsageFilter) => void;
}) {
  const t = useAiText();
  const [draft, setDraft] = useState(filter);
  const patch = (key: keyof AiUsageFilter, value: string) =>
    setDraft({ ...draft, [key]: value || undefined });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft);
      }}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
    >
      <FormField label={t("From (UTC)")}>
        <DateInput
          aria-label={t("From (UTC)")}
          value={draft.from ?? ""}
          onChange={(e) => patch("from", e.target.value)}
        />
      </FormField>
      <FormField label={t("To (UTC)")}>
        <DateInput
          aria-label={t("To (UTC)")}
          value={draft.to ?? ""}
          onChange={(e) => patch("to", e.target.value)}
        />
      </FormField>
      <FormField label={t("Feature")}>
        <Select
          aria-label={t("Feature")}
          value={draft.category ?? ""}
          onChange={(e) => patch("category", e.target.value)}
        >
          <option value="">{t("All features")}</option>
          {AI_CATEGORIES.map((v) => (
            <option key={v} value={v}>
              {aiCategory(v)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("Provider")}>
        <Select
          aria-label={t("Provider")}
          value={draft.provider ?? ""}
          onChange={(e) => patch("provider", e.target.value)}
        >
          <option value="">{t("All providers")}</option>
          <option value="openai">OpenAI</option>
        </Select>
      </FormField>
      <FormField label={t("Model")}>
        <Input
          aria-label={t("Model filter")}
          placeholder={t("Exact model ID")}
          value={draft.model ?? ""}
          onChange={(e) => patch("model", e.target.value)}
        />
      </FormField>
      <FormField label={t("Status")}>
        <Select
          aria-label={t("Status")}
          value={draft.status ?? ""}
          onChange={(e) => patch("status", e.target.value)}
        >
          <option value="">{t("All statuses")}</option>
          {AI_OPERATION_STATUSES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </FormField>
      <div className="sm:col-span-2 xl:col-span-6">
        <Button type="submit">{t("Apply filters")}</Button>
      </div>
    </form>
  );
}
