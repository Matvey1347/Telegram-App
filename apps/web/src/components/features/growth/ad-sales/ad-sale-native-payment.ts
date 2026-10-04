import type { TelegramAdSale } from "@telegram-system/shared";

type NativePaymentSale = Pick<
  TelegramAdSale,
  "payments" | "settlementCurrency" | "totalPaidAmount"
> & {
  paymentSummary?: { amount: string; currency: string } | null;
};

export function nativeAdSalePayment(
  sale: Omit<NativePaymentSale, "payments"> & Partial<NativePaymentSale>,
) {
  const payments = (sale.payments ?? [])
    .filter((payment) => payment.status !== "VOIDED")
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt));
  const currency =
    payments[0]?.currency ||
    sale.paymentSummary?.currency ||
    sale.settlementCurrency;
  const amount = payments.length
    ? payments
        .filter((payment) => payment.currency === currency)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : Number(sale.paymentSummary?.amount ?? sale.totalPaidAmount ?? 0);

  return { amount, currency };
}
