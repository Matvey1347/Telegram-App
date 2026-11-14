"use client";

import type { TelegramAdSale } from "@telegram-system/shared";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
import { formatCompactMoney } from "@/lib/features/finance/money";
import {
  PaymentEditor,
  type PaymentDraft,
} from "./ad-sales-sale-detail-editors";
import {
  RegisterPaymentForm,
  type RegisterPaymentPayload,
} from "./register-payment-form";

export function DealFinanceTransaction({
  sale,
  payments,
  accounts,
  open,
  onToggle,
  onPayment,
  onCreatePayment,
  onDeletePayment,
  onSave,
  saving,
}: {
  sale: TelegramAdSale;
  payments: PaymentDraft[];
  accounts: Account[];
  open: boolean;
  onToggle: () => void;
  onPayment: (id: string, patch: Partial<PaymentDraft>) => void;
  onCreatePayment?: (payload: RegisterPaymentPayload) => Promise<void>;
  onDeletePayment?: (id: string) => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
}) {
  const linkedPaymentLabel = payments.length
    ? `${payments.map((payment) => formatCompactMoney(payment.amount, payment.currency)).join(" · ")} linked`
    : "No finance transaction linked";
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-neutral-400" />
          <div>
            <h4 className="font-medium text-white">Finance transaction</h4>
            <p className="text-sm text-neutral-500">{linkedPaymentLabel}</p>
          </div>
        </div>
        <IconButton
          type="button"
          aria-label={
            payments.length ? "Edit transaction" : "Create finance transaction"
          }
          onClick={onToggle}
        />
      </div>
      {open && payments.length ? (
        <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
          {payments.map((payment) => (
            <div key={payment.id} className="space-y-3">
              <PaymentEditor
                payment={payment}
                accounts={accounts}
                showNotes={false}
                onChange={(patch) => onPayment(payment.id, patch)}
              />
            </div>
          ))}
          {onDeletePayment || onSave ? (
            <div className="flex w-full flex-col gap-2 border-t border-neutral-800 pt-3 sm:flex-row sm:justify-end">
              {onDeletePayment
                ? payments.map((payment) => (
                    <Button
                      key={payment.id}
                      type="button"
                      variant="danger"
                      className="w-full sm:w-auto"
                      onClick={() => onDeletePayment(payment.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Delete transaction
                    </Button>
                  ))
                : null}
              {onSave ? (
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  <Pencil size={16} aria-hidden="true" />
                  {saving ? "Saving…" : "Update transaction"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : open && onCreatePayment ? (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <RegisterPaymentForm
            sale={sale}
            accounts={accounts}
            defaultCurrency={sale.settlementCurrency}
            onCancel={onToggle}
            onSubmit={onCreatePayment}
          />
        </div>
      ) : null}
    </section>
  );
}
