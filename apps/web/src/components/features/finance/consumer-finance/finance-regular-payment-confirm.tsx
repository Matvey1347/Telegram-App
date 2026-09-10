"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
} from "@telegram-system/shared";
import { Button, ErrorState, FormField, Input, Modal } from "./ui";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import type { FinanceLocale } from "./i18n/core";
import { financeRegularPaymentsCopy } from "./i18n/regular-payments";

export function FinanceRegularPaymentConfirm({
  botId,
  payment,
  expectedOccurrenceAt,
  expectedVersion,
  customAmount,
  locale,
  onClose,
  onConfirmed,
  onApplied,
}: {
  botId: string;
  payment: ConsumerFinanceRegularPayment;
  expectedOccurrenceAt: string;
  expectedVersion: number;
  customAmount: boolean;
  locale: FinanceLocale;
  onClose: () => void;
  onConfirmed: (result: ConsumerFinanceRegularPaymentConfirmation) => void;
  onApplied: (payment: ConsumerFinanceRegularPayment) => void;
}) {
  const t = financeRegularPaymentsCopy(locale);
  const [amount, setAmount] = useState(payment.amount);
  const [confirmation, setConfirmation] =
    useState<ConsumerFinanceRegularPaymentConfirmation | null>(null);
  const confirm = useMutation({
    mutationFn: () =>
      consumerFinanceObligationsApi.confirmRegularPayment(botId, payment.id, {
        expectedOccurrenceAt,
        expectedVersion,
        ...(customAmount ? { amount } : {}),
      }),
    onSuccess: (result) => {
      onConfirmed(result);
      if (result.futureAmountUpdateRequired) setConfirmation(result);
      else onClose();
    },
  });
  const apply = useMutation({
    mutationFn: () =>
      consumerFinanceObligationsApi.applyOccurrenceAmount(
        botId,
        payment.id,
        confirmation!.occurrence.id,
        { expectedVersion: confirmation!.regularPayment.version },
      ),
    onSuccess: (updated) => {
      onApplied(updated);
      onClose();
    },
  });
  if (confirmation)
    return (
      <Modal
        open
        onClose={apply.isPending ? () => undefined : onClose}
        closeLabel={t.close}
        title={t.applyAmountQuestion}
      >
        <p className="text-sm text-neutral-300">{t.applyAmountQuestion}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            disabled={apply.isPending}
            onClick={onClose}
          >
            {t.noKeep}
          </Button>
          <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
            {t.yesApply}
          </Button>
        </div>
        {apply.isError ? (
          <div className="mt-3">
            <ErrorState text={t.actionError} />
          </div>
        ) : null}
      </Modal>
    );
  return (
    <Modal
      open
      onClose={confirm.isPending ? () => undefined : onClose}
      closeLabel={t.close}
      title={customAmount ? t.changeAmount : t.confirmPayment}
    >
      <p className="text-sm text-neutral-300">{t.confirmQuestion}</p>
      {customAmount ? (
        <div className="mt-3">
          <FormField label={t.paidAmount}>
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="secondary"
          disabled={confirm.isPending}
          onClick={onClose}
        >
          {t.cancel}
        </Button>
        <Button
          disabled={
            confirm.isPending || (customAmount && !(Number(amount) > 0))
          }
          onClick={() => confirm.mutate()}
        >
          {t.confirmPayment}
        </Button>
      </div>
      {confirm.isError ? (
        <div className="mt-3">
          <ErrorState text={t.actionError} />
        </div>
      ) : null}
    </Modal>
  );
}
