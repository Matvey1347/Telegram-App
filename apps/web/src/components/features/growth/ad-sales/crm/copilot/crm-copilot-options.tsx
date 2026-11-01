"use client";
import { useCopilotText } from "./copilot-copy";
import {
  CRM_COPILOT_CATEGORIES,
  CRM_COPILOT_TONES,
  type CrmPackageProduct,
  type CrmCopilotContextView,
  type CrmCopilotGenerateInput,
} from "@telegram-system/shared";
import {
  FormField,
  MultiSelect,
  Select,
} from "@/components/ui/primitives";
export type CopilotOptions = Omit<
  CrmCopilotGenerateInput,
  "operationId" | "productIds" | "includeNotes"
>;
export const initialCopilotOptions: CopilotOptions = {
  category: "SALES_REPLY_SUGGESTION",
  tone: "NATURAL",
  language: "AUTO",
  processingBasis: "APPROVED_BUSINESS_PROCESSING",
  processingReference: "",
  sourceAcknowledged: true,
};
export function CrmCopilotOptions({
  value,
  onChange,
  context,
  choices,
  products,
  onProducts,
  notes,
  onNotes,
  disabled,
}: {
  value: CopilotOptions;
  onChange: (v: CopilotOptions) => void;
  context?: CrmCopilotContextView;
  choices: CrmPackageProduct[];
  products: string[];
  onProducts: (ids: string[]) => void;
  notes: boolean;
  onNotes: (v: boolean) => void;
  disabled: boolean;
}) {
  const t = useCopilotText();
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t("Operation")}>
          <Select
            aria-label="Copilot operation"
            value={value.category}
            onChange={(e) =>
              onChange({
                ...value,
                category: e.target.value as CopilotOptions["category"],
              })
            }
          >
            {CRM_COPILOT_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {v.replace("SALES_", "").replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Tone")}>
          <Select
            aria-label="Copilot tone"
            value={value.tone}
            onChange={(e) =>
              onChange({
                ...value,
                tone: e.target.value as CopilotOptions["tone"],
              })
            }
          >
            {CRM_COPILOT_TONES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Language")}>
          <Select
            aria-label="Copilot language"
            value={value.language}
            onChange={(e) =>
              onChange({
                ...value,
                language: e.target.value as CopilotOptions["language"],
              })
            }
          >
            <option value="AUTO">{t("Conversation language")}</option>
            <option value="uk">Українська</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </Select>
        </FormField>
      </div>
      <FormField label={t("Products / packages (up to 5)")}>
        <MultiSelect
          value={products}
          onChange={(ids) => {
            if (ids.length <= 5) onProducts(ids);
          }}
          options={choices.map((v) => ({
            value: v.id,
            label: `${v.name} · ${v.channel.title} · ${v.fixedPrice === null ? "Quote required" : v.fixedPrice + " " + v.currency}`,
          }))}
          placeholder={t("Choose verified products")}
          disabled={!context}
        />
      </FormField>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={notes}
          onChange={(e) => onNotes(e.target.checked)}
        />
        {t("Include permitted client notes")}
      </label>
    </fieldset>
  );
}
