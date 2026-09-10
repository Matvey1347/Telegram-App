"use client";

import type { TelegramAdSale } from "@telegram-system/shared";
import { CreditCard, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
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
}: {
  sale: TelegramAdSale;
  payments: PaymentDraft[];
  accounts: Account[];
  open: boolean;
  onToggle: () => void;
  onPayment: (id: string, patch: Partial<PaymentDraft>) => void;
  onCreatePayment?: (payload: RegisterPaymentPayload) => Promise<void>;
  onDeletePayment?: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-neutral-400" />
          <div>
            <h4 className="font-medium text-white">Finance transaction</h4>
            <p className="text-sm text-neutral-500">
              {payments.length
                ? `${sale.totalPaidAmount} ${sale.settlementCurrency} linked`
                : "No finance transaction linked"}
            </p>
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
                onChange={(patch) => onPayment(payment.id, patch)}
              />
              {onDeletePayment ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => onDeletePayment(payment.id)}
                  >
                    <Trash2 size={15} /> Delete finance transaction
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
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
