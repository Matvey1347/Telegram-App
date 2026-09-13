"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionInput,
  ConsumerFinanceTransactionPurpose,
  ConsumerFinanceExpenseNecessity,
} from "@telegram-system/shared";
import { Button, DateInput, FormField, Input, Modal, Select } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  financeCalendarDate,
  financeOccurredAtForDate,
  financeToday,
} from "@/lib/features/finance/consumer-finance-date";
import { type FinanceLocale } from "./i18n/core";
import { financeTransactionsCopy } from "./i18n/transactions";
import { localizeFinanceCategory } from "./finance-category-i18n";

type TransactionMeaning = ConsumerFinanceTransactionPurpose | "SHARED_EXPENSE";

export function FinanceTransactionEditor({
  botId,
  accounts,
  categories,
  editing,
  locale,
  timezone,
  onClose,
  onSaved,
  initiallyOpenType = null,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  editing: ConsumerFinanceTransaction | null;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
  onSaved: (item: ConsumerFinanceTransaction) => void;
  initiallyOpenType?: ConsumerFinanceTransactionInput["type"] | null;
}) {
  const client = useQueryClient();
  const t = financeTransactionsCopy(locale);
  const [open, setOpen] = useState(!!initiallyOpenType);
  const [type, setType] = useState<ConsumerFinanceTransactionInput["type"]>(
    editing?.type ?? initiallyOpenType ?? "EXPENSE",
  );
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [economicAmount, setEconomicAmount] = useState(
    editing?.economicAmount && editing.economicAmount !== editing.amount
      ? editing.economicAmount
      : "",
  );
  const [meaning, setMeaning] = useState<TransactionMeaning>(
    editing?.purpose ?? "ORDINARY",
  );
  const purpose = meaning === "SHARED_EXPENSE" ? "ORDINARY" : meaning;
  const [necessity, setNecessity] = useState<ConsumerFinanceExpenseNecessity>(
    editing?.necessity ?? "UNSPECIFIED",
  );
  const [accountId, setAccountId] = useState(editing?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editing
      ? financeCalendarDate(editing.occurredAt, timezone)
      : financeToday(timezone),
  );
  const [participants, setParticipants] = useState([
    { name: "", amount: "", dueDate: financeToday(timezone) },
  ]);
  const activeAccounts = accounts.filter(
    (item) => !item.archivedAt || item.id === accountId,
  );
  const account =
    activeAccounts.find((item) => item.id === accountId) ?? activeAccounts[0];
  const visibleCategories = categories.filter(
    (item) =>
      (item.type === type && !item.archivedAt) || item.id === categoryId,
  );
  const participantTotal = participants.reduce(
    (sum, participant) => sum + Number(participant.amount || 0),
    0,
  );
  const sharedValid =
    meaning !== "SHARED_EXPENSE" ||
    (!!economicAmount &&
      participants.every(
        (participant) =>
          !!participant.name.trim() &&
          Number(participant.amount) > 0 &&
          /^\d{4}-\d{2}-\d{2}$/.test(participant.dueDate),
      ) &&
      Math.abs(Number(economicAmount) + participantTotal - Number(amount)) <
        0.000001);
  const valid =
    !!account &&
    Number(amount) > 0 &&
    !!occurredAt &&
    (purpose !== "ORDINARY" ||
      !economicAmount ||
      (Number(economicAmount) >= 0 &&
        Number(economicAmount) <= Number(amount))) &&
    sharedValid;
  const mutation = useMutation({
    mutationFn: () => {
      const payload: ConsumerFinanceTransactionInput = {
        accountId: accountId || account?.id || "",
        categoryId: categoryId || undefined,
        type,
        amount,
        ...(purpose !== "ORDINARY"
          ? {
              purpose: purpose as ConsumerFinanceTransactionInput["purpose"],
            }
          : {}),
        economicAmount:
          purpose === "ORDINARY" && economicAmount ? economicAmount : undefined,
        ...(type === "EXPENSE" &&
        purpose === "ORDINARY" &&
        necessity !== "UNSPECIFIED"
          ? { necessity }
          : {}),
        description: description.trim() || undefined,
        occurredAt: financeOccurredAtForDate(
          occurredAt,
          timezone,
          editing?.occurredAt,
        ),
      };
      if (!editing && meaning === "SHARED_EXPENSE") {
        return consumerFinanceObligationsApi
          .createSharedExpense(botId, {
            accountId: payload.accountId,
            categoryId: payload.categoryId,
            amount,
            ownShare: economicAmount,
            description: payload.description,
            occurredAt: payload.occurredAt,
            necessity: payload.necessity,
            participants,
          })
          .then((result) => result.transaction);
      }
      return editing
        ? consumerFinanceApi.updateTransaction(botId, editing.id, payload)
        : consumerFinanceApi.createTransaction(botId, payload);
    },
    onSuccess: (item) => {
      if (!editing && meaning === "SHARED_EXPENSE") {
        void client.invalidateQueries({
          queryKey: consumerFinanceKeys.debtsRoot(botId),
        });
      }
      onSaved(item);
      setOpen(false);
      if (!editing) {
        setAmount("");
        setEconomicAmount("");
        setMeaning("ORDINARY");
        setNecessity("UNSPECIFIED");
        setDescription("");
        setCategoryId("");
        setOccurredAt(financeToday(timezone));
      }
    },
  });
  return (
    <Modal
      open={open || !!editing}
      closeLabel={t.close}
      onClose={() => {
        setOpen(false);
        onClose();
      }}
      title={editing ? t.editTransaction : t.addTransaction}
    >
      <div className="space-y-3">
        <FormField label={t.transactionType}>
          <Select
            uiLocale={locale}
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              setCategoryId("");
              setMeaning("ORDINARY");
            }}
          >
            <option value="EXPENSE">{t.expense}</option>
            <option value="INCOME">{t.income}</option>
          </Select>
        </FormField>
        <FormField label={t.transactionMeaning}>
          <Select
            uiLocale={locale}
            value={meaning}
            onChange={(event) => {
              setMeaning(event.target.value as TransactionMeaning);
              if (
                event.target.value !== "ORDINARY" &&
                event.target.value !== "SHARED_EXPENSE"
              ) {
                setCategoryId("");
                setEconomicAmount("");
              }
            }}
          >
            <option value="ORDINARY">
              {type === "INCOME" ? t.ordinaryIncome : t.ordinaryExpense}
            </option>
            {type === "INCOME" ? (
              <option value="REIMBURSEMENT">{t.reimbursement}</option>
            ) : null}
            {type === "INCOME" ? (
              <option value="PASS_THROUGH">{t.passThrough}</option>
            ) : null}
            {type === "EXPENSE" ? (
              <option value="DEBT_REPAYMENT">{t.debtRepayment}</option>
            ) : null}
            {type === "EXPENSE" && !editing ? (
              <option value="SHARED_EXPENSE">{t.sharedExpense}</option>
            ) : null}
          </Select>
        </FormField>
        <FormField
          label={`${t.amount}${account ? ` (${account.currency})` : ""}`}
        >
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={accountId || account?.id || ""}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {activeAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.iconPresentation.type === "unicode"
                  ? `${item.iconPresentation.value} `
                  : ""}
                {item.name} · {item.currency}
              </option>
            ))}
          </Select>
        </FormField>
        {purpose === "ORDINARY" ? (
          <FormField label={t.category}>
            <Select
              uiLocale={locale}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{t.uncategorized}</option>
              {visibleCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.iconPresentation.type === "unicode"
                    ? `${item.iconPresentation.value} `
                    : ""}
                  {localizeFinanceCategory(item.name, item.key, locale)}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        {meaning === "SHARED_EXPENSE" ? (
          <div className="space-y-2 rounded-xl border border-sky-900/70 bg-sky-950/20 p-3">
            <p className="text-xs text-sky-200">{t.sharedExpenseHelp}</p>
            {participants.map((participant, index) => (
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]"
                key={index}
              >
                <Input
                  aria-label={t.participantName}
                  placeholder={t.participantName}
                  value={participant.name}
                  onChange={(event) =>
                    setParticipants((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={t.participantDebt}
                  inputMode="decimal"
                  placeholder={t.participantDebt}
                  value={participant.amount}
                  onChange={(event) =>
                    setParticipants((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, amount: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <DateInput
                  aria-label={t.returnBy}
                  lang={locale}
                  value={participant.dueDate}
                  onChange={(event) =>
                    setParticipants((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, dueDate: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Button
                  disabled={participants.length === 1}
                  onClick={() =>
                    setParticipants((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  {t.removeParticipant}
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                setParticipants((current) => [
                  ...current,
                  { name: "", amount: "", dueDate: occurredAt },
                ])
              }
            >
              {t.addParticipant}
            </Button>
            <p className="text-xs text-neutral-400">
              {t.allocated}:{" "}
              {(Number(economicAmount || 0) + participantTotal).toFixed(2)} /{" "}
              {Number(amount || 0).toFixed(2)} {account?.currency}
            </p>
          </div>
        ) : null}
        {purpose === "ORDINARY" ? (
          <FormField label={`${t.economicAmount} (${account?.currency ?? ""})`}>
            <Input
              inputMode="decimal"
              placeholder={amount || "0"}
              value={economicAmount}
              onChange={(event) => setEconomicAmount(event.target.value)}
            />
          </FormField>
        ) : null}
        {type === "EXPENSE" && purpose === "ORDINARY" ? (
          <FormField label={t.necessity}>
            <Select
              uiLocale={locale}
              value={necessity}
              onChange={(event) =>
                setNecessity(
                  event.target.value as ConsumerFinanceExpenseNecessity,
                )
              }
            >
              <option value="UNSPECIFIED">{t.necessityUnspecified}</option>
              <option value="REQUIRED">{t.necessityRequired}</option>
              <option value="DISCRETIONARY">{t.necessityDiscretionary}</option>
            </Select>
          </FormField>
        ) : null}
        <FormField label={t.date}>
          <DateInput
            lang={locale}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </FormField>
        <FormField label={t.description}>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <Button
          className="w-full"
          disabled={!valid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t.saving : t.saveTransaction}
        </Button>
        {mutation.isError ? (
          <p className="text-sm text-rose-300">{t.transactionSaveError}</p>
        ) : null}
      </div>
    </Modal>
  );
}
