"use client";

import { useState } from "react";
import type {
  ConsumerFinanceSavingsGoal,
  ConsumerFinanceSavingsGoalInput,
} from "@telegram-system/shared";
import { Button, DateInput, FormField, Input, Modal, Textarea } from "./ui";
import { FinanceCurrencySelect } from "./ui/finance-currency-select";
import type { FinanceLocale } from "./i18n/core";
import { financeSavingsCopy } from "./i18n/savings";

export function FinanceSavingsGoalEditor({
  open,
  locale,
  defaultCurrency,
  goal,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  locale: FinanceLocale;
  defaultCurrency: string;
  goal?: ConsumerFinanceSavingsGoal | null;
  pending: boolean;
  error: boolean;
  onClose: () => void;
  onSubmit: (payload: ConsumerFinanceSavingsGoalInput) => void;
}) {
  const t = financeSavingsCopy(locale);
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal?.targetAmount ?? "");
  const [currency, setCurrency] = useState(goal?.currency ?? defaultCurrency);
  const [targetDate, setTargetDate] = useState(
    goal?.targetDate?.slice(0, 10) ?? "",
  );
  const [note, setNote] = useState(goal?.note ?? "");

  return (
    <Modal open={open} onClose={onClose} title={goal ? t.editGoal : t.add}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            name: name.trim(),
            targetAmount: target,
            currency,
            targetDate: targetDate || null,
            note: note.trim() || null,
          });
        }}
      >
        <FormField label={t.name} required>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label={t.target} required>
          <Input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </FormField>
        <FormField label={t.currency} required>
          <FinanceCurrencySelect
            locale={locale}
            value={currency}
            onChange={setCurrency}
          />
        </FormField>
        <FormField label={t.targetDate}>
          <DateInput
            lang={locale}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </FormField>
        <FormField label={t.note}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            disabled={pending || !name.trim() || Number(target) <= 0}
          >
            {pending ? t.saving : goal ? t.update : t.create}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-rose-300 sm:col-span-2">
            {t.saveError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
