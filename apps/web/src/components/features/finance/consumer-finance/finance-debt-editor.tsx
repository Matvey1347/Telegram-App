"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceDebt,
  ConsumerFinanceDebtDirection,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
} from "./ui";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { financeCalendarDate } from "@/lib/features/finance/consumer-finance-date";
import type { FinanceLocale } from "./i18n/core";
import { financeDebtsCopy } from "./i18n/debts";

export function FinanceDebtEditor({
  botId,
  editing,
  locale,
  onClose,
  onSaved,
}: {
  botId: string;
  editing: ConsumerFinanceDebt | null;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
  onSaved: (debt: ConsumerFinanceDebt) => void;
}) {
  const t = financeDebtsCopy(locale);
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  const [direction, setDirection] = useState<ConsumerFinanceDebtDirection>(
    editing?.direction ?? "I_OWE",
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [accountId, setAccountId] = useState(editing?.accountId ?? "");
  const [dueDate, setDueDate] = useState(
    editing ? financeCalendarDate(editing.dueAt, editing.scheduleTimezone) : "",
  );
  const [note, setNote] = useState(editing?.note ?? "");
  const rows = (accounts.data ?? []).filter(
    (account) => !account.archivedAt || account.id === editing?.accountId,
  );
  const selectedAccountId =
    accountId && rows.some((account) => account.id === accountId)
      ? accountId
      : (rows[0]?.id ?? "");
  const save = useMutation({
    mutationFn: () => {
      const input = {
        direction,
        name: name.trim(),
        amount,
        accountId: selectedAccountId,
        dueDate,
        note: note.trim() || null,
      };
      return editing
        ? consumerFinanceObligationsApi.updateDebt(botId, editing.id, input)
        : consumerFinanceObligationsApi.createDebt(botId, input);
    },
    onSuccess: (saved) => onSaved(saved),
  });
  if (accounts.isLoading) return <LoadingState text={t.loadingAccounts} />;
  if (accounts.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.accountLoadError} />
        <Button onClick={() => accounts.refetch()}>{t.retry}</Button>
      </div>
    );
  const valid =
    !!name.trim() &&
    Number(amount) > 0 &&
    !!selectedAccountId &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t.close}
      title={editing ? t.editDebt : t.addDebt}
    >
      <div className="space-y-3">
        <FormField label={t.direction}>
          <Select
            uiLocale={locale}
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as ConsumerFinanceDebtDirection)
            }
          >
            <option value="I_OWE">{t.iOwe}</option>
            <option value="OWED_TO_ME">{t.owedToMe}</option>
          </Select>
        </FormField>
        <FormField label={t.debtName}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label={t.amount}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={selectedAccountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {rows.map((account) => (
              <option
                key={account.id}
                value={account.id}
                data-icon-emoji={
                  account.iconPresentation.type === "unicode"
                    ? account.iconPresentation.value
                    : undefined
                }
                data-option-meta={account.currency}
              >
                {account.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.dueDate}>
          <DateInput
            lang={locale}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </FormField>
        <FormField label={t.note}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        <Button
          className="w-full"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t.saving : t.save}
        </Button>
        {save.isError ? <ErrorState text={t.debtSaveError} /> : null}
      </div>
    </Modal>
  );
}
