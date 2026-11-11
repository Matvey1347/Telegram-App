"use client";

import { CustomSelect, FormField, Input } from "@/components/ui/primitives";

export type AiPostingMode = "TEST" | "REVIEW" | "AUTOPILOT";

export function AiPostingModeFields({
  mode,
  draftExpirationDays,
  onModeChange,
  onDraftExpirationChange,
}: {
  mode: AiPostingMode;
  draftExpirationDays: number;
  onModeChange: (mode: AiPostingMode) => void;
  onDraftExpirationChange: (days: number) => void;
}) {
  return (
    <>
      <FormField label="Режим работы">
        <CustomSelect
          value={mode}
          onChange={(value) => onModeChange(value as AiPostingMode)}
          options={[
            { value: "TEST", label: "Тест: только черновики" },
            { value: "REVIEW", label: "Ревью перед публикацией" },
            { value: "AUTOPILOT", label: "Автопилот" },
          ]}
        />
      </FormField>
      <FormField label="Срок годности черновика, дней">
        <Input
          type="number"
          min={1}
          max={365}
          value={draftExpirationDays}
          onChange={(event) => onDraftExpirationChange(Number(event.target.value))}
        />
      </FormField>
    </>
  );
}
