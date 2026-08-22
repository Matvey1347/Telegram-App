"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceReminder } from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
import {
  financeCopy,
  financeIntlLocale,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceReminders({
  botId,
  locale,
  currency,
  timezone,
}: {
  botId: string;
  locale: FinanceLocale;
  currency: string;
  timezone: string;
}) {
  const t = financeCopy(locale);
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [offset, setOffset] = useState("60");
  const reminders = useQuery({
    queryKey: consumerFinanceKeys.reminders(botId),
    queryFn: () => consumerFinanceApi.reminders(botId),
  });
  const create = useMutation({
    mutationFn: () =>
      consumerFinanceApi.createReminder(botId, {
        name: name.trim(),
        amount,
        currency,
        dayOfMonth: Number(dayOfMonth),
        reminderOffsetMinutes: Number(offset),
      }),
    onSuccess: (created) => {
      client.setQueryData<ConsumerFinanceReminder[]>(
        consumerFinanceKeys.reminders(botId),
        (current = []) => [...current, created],
      );
      setName("");
      setAmount("");
    },
  });
  const valid =
    name.trim() &&
    Number(amount) > 0 &&
    Number(dayOfMonth) >= 1 &&
    Number(dayOfMonth) <= 28 &&
    Number(offset) >= 0;

  return (
    <Card>
      <h2 className="font-medium">{t.reminders}</h2>
      <p className="mt-1 text-sm text-neutral-400">{t.remindersHelp}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label={t.reminderName}>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label={`${t.reminderAmount} (${currency})`}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">{t.reminderAmountHelp}</p>
        </FormField>
        <FormField label={t.reminderDay}>
          <Input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
          />
        </FormField>
        <FormField label={t.reminderOffset}>
          <Input
            type="number"
            min={0}
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
          />
        </FormField>
      </div>
      <Button
        className="mt-3"
        disabled={!valid || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? t.saving : t.addReminder}
      </Button>
      {create.isError ? (
        <p className="mt-2 text-sm text-rose-300">{t.reminderSaveError}</p>
      ) : null}
      <div className="mt-4 border-t border-neutral-800 pt-3">
        {reminders.isLoading ? <LoadingState text={t.loading} /> : null}
        {reminders.isError ? (
          <div className="space-y-2">
            <ErrorState text={t.reminderLoadError} />
            <Button variant="secondary" onClick={() => reminders.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
        {reminders.data?.length ? (
          <div className="divide-y divide-neutral-800">
            {reminders.data.map((reminder) => (
              <div className="flex justify-between gap-3 py-3" key={reminder.id}>
                <div>
                  <p className="text-sm font-medium">{reminder.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t.nextReminder}: {new Intl.DateTimeFormat(financeIntlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(reminder.nextOccurrenceAt))}
                  </p>
                </div>
                <strong className="shrink-0 text-sm">
                  {formatMoney(reminder.amount, reminder.currency, "symbol")}
                </strong>
              </div>
            ))}
          </div>
        ) : reminders.isSuccess ? (
          <EmptyState text={t.noReminders} />
        ) : null}
      </div>
    </Card>
  );
}
