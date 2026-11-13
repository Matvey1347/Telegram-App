"use client";

import {
  Button,
  Card,
  FormField,
  MultiSelect,
  ToggleRow,
} from "@/components/ui/primitives";
import type { ResolvedEmoji } from "@telegram-system/shared";

type StructureOption = {
  value: string;
  label: string;
  iconPresentation?: ResolvedEmoji;
  iconEmoji?: string;
};

export function AiPostingStructureSection({
  categories,
  formats,
  categoryOptions,
  formatOptions,
  allowCreateHypotheses,
  allowCreateGroups,
  pending,
  ready,
  error,
  result,
  onCategories,
  onFormats,
  onAllowHypotheses,
  onAllowGroups,
  onGenerate,
}: {
  categories: string[];
  formats: string[];
  categoryOptions: StructureOption[];
  formatOptions: StructureOption[];
  allowCreateHypotheses: boolean;
  allowCreateGroups: boolean;
  pending: boolean;
  ready: boolean;
  error: boolean;
  result?: { groups: string[]; hypotheses: string[] };
  onCategories: (value: string[]) => void;
  onFormats: (value: string[]) => void;
  onAllowHypotheses: (value: boolean) => void;
  onAllowGroups: (value: boolean) => void;
  onGenerate: () => void;
}) {
  return (
    <Card className="space-y-4 bg-neutral-900/60">
      <h2 className="text-lg font-semibold">Контент-гипотезы и группы</h2>
      <FormField label="Контент-гипотезы">
        <MultiSelect
          value={categories}
          onChange={onCategories}
          disabled={pending}
          options={categoryOptions}
          allSelectedLabel="Использовать все контент-гипотезы канала"
          placeholder="Выберите контент-гипотезы"
        />
      </FormField>
      <ToggleRow
        checked={allowCreateHypotheses}
        onChange={onAllowHypotheses}
        disabled={pending}
        label="Разрешить создавать новые контент-гипотезы"
        description="Новая гипотеза создаётся при сохранении публикации в черновики."
      />
      <FormField label="Группы">
        <MultiSelect
          value={formats}
          onChange={onFormats}
          disabled={pending}
          options={formatOptions}
          allSelectedLabel="Использовать все группы канала"
          placeholder="Выберите группы"
        />
      </FormField>
      <ToggleRow
        checked={allowCreateGroups}
        onChange={onAllowGroups}
        disabled={pending}
        label="Разрешить создавать новые группы"
        description="Новая группа создаётся при сохранении публикации в черновики."
      />
      <Button
        type="button"
        variant="secondary"
        disabled={pending || !ready}
        onClick={onGenerate}
      >
        {pending
          ? "Генерируем…"
          : "Сгенерировать группы и контент-гипотезы с AI"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          Не удалось сгенерировать группы и контент-гипотезы. Проверьте
          настройки AI и повторите попытку.
        </p>
      )}
      {result && (
        <p role="status" className="text-sm text-emerald-300">
          Создано групп: {result.groups.length}, контент-гипотез:{" "}
          {result.hypotheses.length}.
        </p>
      )}
    </Card>
  );
}
