"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferInput,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import {
  financeCalendarDate,
  financeOccurredAtForDate,
  financeToday,
} from "@/lib/features/finance/finance-date";
import { financeCopy, type FinanceLocale } from "./finance-i18n";

export function FinanceTransferEditor({
  botId,
  accounts,
  locale,
  timezone,
  editing,
  initiallyOpen,
  onClose,
  onSaved,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  locale: FinanceLocale;
  timezone: string;
  editing: ConsumerFinanceTransfer | null;
  initiallyOpen: boolean;
  onClose: () => void;
  onSaved: (item: ConsumerFinanceTransfer) => void;
}) {
  const t = financeCopy(locale);
  const [open, setOpen] = useState(initiallyOpen);
  const [fromAccountId, setFrom] = useState(editing?.fromAccountId ?? "");
  const [toAccountId, setTo] = useState(editing?.toAccountId ?? "");
  const [amount, setAmount] = useState(editing?.fromAmount ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editing
      ? financeCalendarDate(editing.occurredAt, timezone)
      : financeToday(timezone),
  );
  const fromOptions = accounts.filter(
    (item) =>
      (!item.archivedAt || item.id === fromAccountId) &&
      item.id !== toAccountId,
  );
  const toOptions = accounts.filter(
    (item) =>
      (!item.archivedAt || item.id === toAccountId) &&
      item.id !== fromAccountId,
  );
  const from =
    accounts.find((item) => item.id === fromAccountId) ?? fromOptions[0];
  const to = accounts.find((item) => item.id === toAccountId);
  const same = !!from && !!to && from.id === to.id;
  const mutation = useMutation({
    mutationFn: () => {
      const payload: ConsumerFinanceTransferInput = {
        fromAccountId: fromAccountId || from?.id || "",
        toAccountId,
        amount,
        description: description.trim() || undefined,
        occurredAt: financeOccurredAtForDate(
          occurredAt,
          timezone,
          editing?.occurredAt,
        ),
      };
      return editing
        ? consumerFinanceApi.updateTransfer(botId, editing.id, payload)
        : consumerFinanceApi.createTransfer(botId, payload);
    },
    onSuccess: (item) => {
      onSaved(item);
      setOpen(false);
    },
  });
  const activeCount = accounts.filter((item) => !item.archivedAt).length;
  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        disabled={activeCount < 2}
        onClick={() => {
          setFrom(accounts.find((item) => !item.archivedAt)?.id ?? "");
          setTo("");
          setAmount("");
          setDescription("");
          setOccurredAt(financeToday(timezone));
          setOpen(true);
        }}
      >
        <Plus size={16} /> {t.addTransfer}
      </Button>
      {activeCount < 2 ? (
        <p className="text-sm text-neutral-400">{t.notEnoughAccounts}</p>
      ) : null}
      <Modal
        open={open || !!editing}
        closeLabel={t.close}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title={editing ? t.editTransfer : t.addTransfer}
      >
        <div className="space-y-3">
          <FormField label={t.fromAccount}>
            <Select
              uiLocale={locale}
              value={fromAccountId || from?.id || ""}
              onChange={(event) => setFrom(event.target.value)}
            >
              {fromOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.toAccount}>
            <Select
              uiLocale={locale}
              value={toAccountId}
              onChange={(event) => setTo(event.target.value)}
            >
              <option value="">{t.selectAccount}</option>
              {toOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label={`${t.sentAmount}${from ? ` (${from.currency})` : ""}`}
          >
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
          {from && to && from.currency !== to.currency ? (
            <p className="text-xs text-neutral-400">{t.automaticConversion}</p>
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
          {same ? (
            <p className="text-sm text-rose-300">{t.sameAccountError}</p>
          ) : null}
          <Button
            className="w-full"
            disabled={
              !from ||
              !to ||
              same ||
              Number(amount) <= 0 ||
              !occurredAt ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t.saving : t.saveTransfer}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-rose-300">{t.transferSaveError}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
