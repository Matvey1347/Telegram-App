"use client";

import { useState } from "react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceSavingsGoal,
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
import type { FinanceLocale } from "./i18n/core";
import { financeSavingsCopy } from "./i18n/savings";
import {
  dateInputToIso,
  todayInputValue,
} from "@/lib/features/finance/consumer-finance-assets";

export type SavingsAction = "ALLOCATE" | "RELEASE" | "REALLOCATE";
export type SavingsActionValues = {
  accountId: string;
  amount: string;
  occurredAt: string;
  note?: string;
  linkedTransferId?: string;
  toGoalId?: string;
};

export function FinanceSavingsActionModal({
  open,
  action,
  goal,
  goals,
  accounts,
  locale,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  action: SavingsAction;
  goal: ConsumerFinanceSavingsGoal;
  goals: ConsumerFinanceSavingsGoal[];
  accounts: ConsumerFinanceAccount[];
  locale: FinanceLocale;
  pending: boolean;
  error: boolean;
  onClose: () => void;
  onSubmit: (values: SavingsActionValues) => void;
}) {
  const t = financeSavingsCopy(locale);
  const eligibleAccounts = accounts.filter(
    (account) => !account.archivedAt && account.currency === goal.currency,
  );
  const destinations = goals.filter(
    (item) =>
      item.id !== goal.id &&
      item.status === "ACTIVE" &&
      item.currency === goal.currency,
  );
  const [accountId, setAccountId] = useState(eligibleAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [transferId, setTransferId] = useState("");
  const [toGoalId, setToGoalId] = useState(destinations[0]?.id ?? "");
  const title =
    action === "ALLOCATE"
      ? t.allocate
      : action === "RELEASE"
        ? t.release
        : t.move;
  return (
    <Modal open={open} onClose={onClose} title={`${title}: ${goal.name}`}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            accountId,
            amount,
            occurredAt: dateInputToIso(date),
            note: note.trim() || undefined,
            linkedTransferId: transferId.trim() || undefined,
            toGoalId: toGoalId || undefined,
          });
        }}
      >
        <p className="text-sm text-neutral-400">{t.allocateHelp}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t.account} required>
            <Select
              uiLocale={locale}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">{t.chooseAccount}</option>
              {eligibleAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={`${t.amount} (${goal.currency})`} required>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          {action === "REALLOCATE" ? (
            <FormField label={t.destination} required>
              <Select
                uiLocale={locale}
                value={toGoalId}
                onChange={(e) => setToGoalId(e.target.value)}
              >
                <option value="">{t.chooseGoal}</option>
                {destinations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label={t.date} required>
            <DateInput
              lang={locale}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          {action !== "REALLOCATE" ? (
            <FormField label={t.transferLink}>
              <Input
                value={transferId}
                onChange={(e) => setTransferId(e.target.value)}
              />
            </FormField>
          ) : null}
          <FormField label={t.note}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
        {action !== "REALLOCATE" ? (
          <p className="text-xs text-neutral-500">{t.transferHelp}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {t.actionError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              !accountId ||
              Number(amount) <= 0 ||
              (action === "REALLOCATE" && !toGoalId)
            }
          >
            {pending ? t.saving : title}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
