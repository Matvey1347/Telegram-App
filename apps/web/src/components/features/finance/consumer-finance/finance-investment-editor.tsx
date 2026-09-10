"use client";

import { useState } from "react";
import type {
  ConsumerFinanceInvestment,
  ConsumerFinanceInvestmentInput,
  ConsumerFinanceInvestmentType,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "./ui";
import { FinanceCurrencySelect } from "./ui/finance-currency-select";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import {
  dateInputToIso,
  todayInputValue,
} from "@/lib/features/finance/consumer-finance-assets";

const TYPES: ConsumerFinanceInvestmentType[] = [
  "BUSINESS",
  "REAL_ESTATE",
  "SECURITIES",
  "CRYPTO",
  "DIGITAL_ASSET",
  "PHYSICAL_ASSET",
  "OTHER",
];

export function investmentTypeLabel(
  type: ConsumerFinanceInvestmentType,
  t: ReturnType<typeof financeInvestmentsCopy>,
) {
  return {
    BUSINESS: t.business,
    REAL_ESTATE: t.realEstate,
    SECURITIES: t.securities,
    CRYPTO: t.crypto,
    DIGITAL_ASSET: t.digitalAsset,
    PHYSICAL_ASSET: t.physicalAsset,
    OTHER: t.other,
  }[type];
}

export function FinanceInvestmentEditor({
  open,
  investment,
  locale,
  defaultCurrency,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  investment?: ConsumerFinanceInvestment | null;
  locale: FinanceLocale;
  defaultCurrency: string;
  pending: boolean;
  error: boolean;
  onClose: () => void;
  onSubmit: (payload: ConsumerFinanceInvestmentInput) => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const [name, setName] = useState(investment?.name ?? "");
  const [description, setDescription] = useState(investment?.description ?? "");
  const [type, setType] = useState<ConsumerFinanceInvestmentType>(
    investment?.type ?? "OTHER",
  );
  const [currency, setCurrency] = useState(
    investment?.currency ?? defaultCurrency,
  );
  const [startedAt, setStartedAt] = useState(
    investment?.startedAt.slice(0, 10) ?? todayInputValue(),
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={investment ? t.editInvestment : t.add}
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            name: name.trim(),
            description: description.trim() || null,
            type,
            currency,
            startedAt: dateInputToIso(startedAt),
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
        <FormField label={t.type} required>
          <Select
            uiLocale={locale}
            value={type}
            onChange={(e) =>
              setType(e.target.value as ConsumerFinanceInvestmentType)
            }
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {investmentTypeLabel(value, t)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.currency} required>
          <FinanceCurrencySelect
            locale={locale}
            value={currency}
            onChange={setCurrency}
          />
        </FormField>
        <FormField label={t.startedAt} required>
          <DateInput
            lang={locale}
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </FormField>
        <FormField label={t.description}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? t.saving : investment ? t.update : t.create}
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
