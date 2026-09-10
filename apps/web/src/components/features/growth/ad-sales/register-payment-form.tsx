"use client";

import { useMemo, useState } from "react";
import type { TelegramAdSale } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
import {
  autoAllocatePayment,
  toNumber,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  PaymentEditor,
  type PaymentDraft,
} from "./ad-sales-sale-detail-editors";

export type RegisterPaymentPayload = {
  accountId: string;
  amount: number;
  currency: string;
  paidAt: string;
  notes?: string;
  allocations: Array<{ placementId: string; amount: number }>;
};

export function RegisterPaymentForm({
  sale,
  accounts,
  defaultCurrency,
  onCancel,
  onSubmit,
  busy = false,
}: {
  sale: TelegramAdSale;
  accounts: Account[];
  defaultCurrency: string;
  onCancel: () => void;
  onSubmit: (payload: RegisterPaymentPayload) => Promise<void>;
  busy?: boolean;
}) {
  const preferredAccount = accounts.find((account) => account.isActive);
  const initialAmount = toNumber(
    sale.outstandingAmount || sale.totalAgreedAmount,
  );
  const now = new Date();
  const [payment, setPayment] = useState<PaymentDraft>({
    id: "new-payment",
    accountId: preferredAccount?.id ?? "",
    amount: initialAmount ? String(initialAmount) : "",
    currency: preferredAccount?.currency ?? defaultCurrency,
    paidDate: localDate(now),
    paidTime: localTime(now),
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const amount = toNumber(payment.amount);
  const allocation = useMemo(
    () =>
      autoAllocatePayment({
        amount,
        placements: sale.placements.map((placement) => ({
          id: placement.id,
          agreedPrice: placement.agreedPrice,
          paidAllocatedAmount: placement.paidAllocatedAmount,
        })),
      }),
    [amount, sale.placements],
  );
  const isBusy = busy || submitting;

  return (
    <div className="space-y-4">
      <PaymentEditor
        payment={payment}
        accounts={accounts}
        onChange={(patch) =>
          setPayment((current) => ({ ...current, ...patch }))
        }
      />
      <div className="rounded-lg border border-sky-900/60 bg-sky-950/25 px-3 py-2.5 text-sm text-sky-100">
        The payment will be split automatically across the unpaid channel
        placements.
        {allocation.allocations.length ? (
          <span className="ml-1 text-sky-300">
            {allocation.allocations.length} placement
            {allocation.allocations.length === 1 ? "" : "s"} covered.
          </span>
        ) : null}
      </div>
      {allocation.unallocatedAmount > 0 ? (
        <p className="text-sm text-sky-300">
          {allocation.unallocatedAmount} {payment.currency} will be recorded as
          an unallocated payment amount above the current deal value.
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isBusy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={
            isBusy ||
            !payment.accountId ||
            amount <= 0 ||
            !payment.paidDate ||
            !payment.paidTime
          }
          onClick={async () => {
            const paidAt = new Date(
              `${payment.paidDate}T${payment.paidTime}:00`,
            );
            if (Number.isNaN(paidAt.getTime())) {
              setError("Choose a valid payment date and time.");
              return;
            }
            setSubmitting(true);
            setError("");
            try {
              await onSubmit({
                accountId: payment.accountId,
                amount,
                currency: payment.currency,
                paidAt: paidAt.toISOString(),
                notes: payment.notes.trim() || undefined,
                allocations: allocation.allocations,
              });
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not create the finance transaction.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {isBusy ? "Saving…" : "Create transaction"}
        </Button>
      </div>
    </div>
  );
}

function localDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localTime(date: Date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}
