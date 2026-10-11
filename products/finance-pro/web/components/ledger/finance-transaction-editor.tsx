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
import {
  Button,
  DateInput,
  FinanceNecessityToggle,
  FormField,
  Input,
  Modal,
  Select,
} from "@finance-pro/web/components/ui";
import { consumerFinanceApi } from "@finance-pro/web/lib/api/consumer-finance-api";
import { consumerFinanceObligationsApi } from "@finance-pro/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";
import {
  financeCalendarDate,
  financeOccurredAtForDate,
  financeToday,
} from "@finance-pro/web/lib/formatters/consumer-finance-date";
import { type FinanceLocale } from "@finance-pro/web/components/i18n/core";
import { financeTransactionsCopy } from "@finance-pro/web/components/i18n/transactions";
import { localizeFinanceCategory } from "@finance-pro/web/components/catalog/finance-category-i18n";

type TransactionMeaning = ConsumerFinanceTransactionPurpose | "SHARED_EXPENSE";

function normalizeMoneyInput(value: string) {
  return value.replace(/,/g, ".");
}

function moneyValue(value: string) {
  const parsed = Number(normalizeMoneyInput(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  onSpecialAction,
  onSaveDraft,
  allowedCurrency,
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
  onSpecialAction?: (action: "transfer" | "debt" | "investment") => void;
  /** Proposal review reuses this form without writing a ledger transaction. */
  onSaveDraft?: (payload: ConsumerFinanceTransactionInput) => Promise<void>;
  allowedCurrency?: string;
}) {
  const client = useQueryClient();
  const t = financeTransactionsCopy(locale);
  const [open, setOpen] = useState(!!initiallyOpenType);
  const [type, setType] = useState<ConsumerFinanceTransactionInput["type"]>(
    editing?.type ?? initiallyOpenType ?? "EXPENSE",
  );
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [meaning, setMeaning] = useState<TransactionMeaning>(
    editing?.purpose ?? "ORDINARY",
  );
  const linkedInvestment = Boolean(editing?.purpose.startsWith("INVESTMENT_"));
  const purpose = meaning === "SHARED_EXPENSE" ? "ORDINARY" : meaning;
  const [necessity, setNecessity] = useState<ConsumerFinanceExpenseNecessity>(
    editing?.necessity ?? "DISCRETIONARY",
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
    (item) =>
      (!item.archivedAt || item.id === accountId) &&
      (!linkedInvestment || item.currency === editing?.currency) &&
      (!allowedCurrency || item.currency === allowedCurrency),
  );
  const account =
    activeAccounts.find((item) => item.id === accountId) ?? activeAccounts[0];
  const categoryParents = new Set(
    categories.filter((item) => !item.archivedAt && item.parentId).map((item) => item.parentId),
  );
  const visibleCategories = categories.filter(
    (item) =>
      ((item.type === type && !item.archivedAt && !categoryParents.has(item.id)) ||
        item.id === categoryId),
  );
  const participantTotal = participants.reduce(
    (sum, participant) => sum + moneyValue(participant.amount),
    0,
  );
  const sharedValid =
    meaning !== "SHARED_EXPENSE" ||
    (participants.every(
        (participant) =>
          !!participant.name.trim() &&
          moneyValue(participant.amount) > 0 &&
          /^\d{4}-\d{2}-\d{2}$/.test(participant.dueDate),
      ) &&
      participantTotal <= moneyValue(amount));
  const valid =
    !!account &&
    moneyValue(amount) > 0 &&
    !!occurredAt &&
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
            ownShare: (moneyValue(amount) - participantTotal).toString(),
            description: payload.description,
            occurredAt: payload.occurredAt,
            necessity: payload.necessity,
            participants,
          })
          .then((result) => result.transaction);
      }
      if (onSaveDraft && editing)
        return onSaveDraft({
          ...payload,
          economicAmount: undefined,
        }).then(() => editing);
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
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t.transactionType}>
          <Select
            uiLocale={locale}
            value={type}
            disabled={linkedInvestment || Boolean(onSaveDraft)}
            onChange={(event) => {
              if (event.target.value === "TRANSFER") {
                onClose();
                onSpecialAction?.("transfer");
                return;
              }
              setType(event.target.value as typeof type);
              setCategoryId("");
              setMeaning("ORDINARY");
            }}
          >
            <option className="text-white" value="EXPENSE" data-icon-symbol="expense">{t.expense}</option>
            <option className="text-white" value="INCOME" data-icon-symbol="income">{t.income}</option>
            {!editing ? <option className="text-white" value="TRANSFER" data-icon-symbol="transfer">{t.transfers}</option> : null}
          </Select>
        </FormField>
        {purpose === "ORDINARY" ? (
          <FormField label={t.category}>
            <Select
              uiLocale={locale}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                const category = categories.find(
                  (item) => item.id === event.target.value,
                );
                if (category?.necessity && category.necessity !== "UNSPECIFIED")
                  setNecessity(category.necessity);
              }}
            >
              <option value="">{t.uncategorized}</option>
              {visibleCategories.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  data-icon-emoji={
                    item.iconPresentation.type === "unicode"
                      ? item.iconPresentation.value
                      : undefined
                  }
                >
                  {localizeFinanceCategory(item.name, item.key, locale)}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <div />
        )}
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={accountId || account?.id || ""}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {activeAccounts.map((item) => (
              <option
                key={item.id}
                value={item.id}
                data-icon-emoji={
                  item.iconPresentation.type === "unicode"
                    ? item.iconPresentation.value
                    : undefined
                }
                data-option-meta={item.currency}
              >
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.amount}>
          <Input
            inputMode="decimal"
            suffix={account?.currency}
            value={amount}
            onChange={(event) => setAmount(normalizeMoneyInput(event.target.value))}
          />
        </FormField>
        {!linkedInvestment ? <FormField className="col-span-2" label={t.transactionMeaning}>
          <Select
            uiLocale={locale}
            value={meaning}
            onChange={(event) => {
              setMeaning(event.target.value as TransactionMeaning);
              if (event.target.value !== "ORDINARY") {
                setCategoryId("");
              }
            }}
          >
            <option value="ORDINARY" data-icon-emoji={type === "INCOME" ? "💰" : "💸"}>
              {type === "INCOME" ? t.ordinaryIncome : t.ordinaryExpense}
            </option>
            {type === "INCOME" ? (
              <option value="REIMBURSEMENT" data-icon-emoji="↩️">{t.reimbursement}</option>
            ) : null}
            {type === "INCOME" ? (
              <option value="PASS_THROUGH" data-icon-emoji="🤝">{t.passThrough}</option>
            ) : null}
            {type === "EXPENSE" && !editing ? (
              <option value="SHARED_EXPENSE" data-icon-emoji="👥">{t.sharedExpense}</option>
            ) : null}
          </Select>
        </FormField> : null}
        {meaning === "SHARED_EXPENSE" ? (
          <div className="col-span-2 space-y-3 rounded-xl border border-sky-900/70 bg-sky-950/20 p-3">
            <p className="text-xs text-sky-200">{t.sharedExpenseHelp}</p>
            {participants.map((participant, index) => (
              <div
                className="grid grid-cols-2 gap-2"
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
                  suffix={account?.currency}
                  placeholder={t.participantDebt}
                  value={participant.amount}
                  onChange={(event) =>
                    setParticipants((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              amount: normalizeMoneyInput(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                />
                <DateInput
                  className="col-span-2"
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
                {participants.length > 1 && index > 0 ? (
                  <Button
                    className="col-span-2 w-full"
                    variant="danger"
                    onClick={() =>
                      setParticipants((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    {t.removeParticipant}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              className="w-full"
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
              {participantTotal.toFixed(2)} / {moneyValue(amount).toFixed(2)} {account?.currency}
            </p>
          </div>
        ) : null}
        {type === "EXPENSE" && purpose === "ORDINARY" ? (
          <FinanceNecessityToggle
            className="col-span-2"
            value={necessity}
            locale={locale}
            onChange={setNecessity}
          />
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
          className="w-full col-span-2"
          disabled={!valid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t.saving : t.saveTransaction}
        </Button>
        {mutation.isError ? (
          <p className="text-sm text-rose-300 col-span-2">
            {t.transactionSaveError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
