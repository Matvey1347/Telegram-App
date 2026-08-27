import type { TelegramAdSale } from "@telegram-system/shared";

export function nativeAdSalePayment(sale: TelegramAdSale) {
  const payments = (sale.payments ?? [])
    .filter((payment) => payment.status !== "VOIDED")
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt));
  const currency = payments[0]?.currency || sale.settlementCurrency;
  const amount = payments.length
    ? payments
        .filter((payment) => payment.currency === currency)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : Number(sale.totalPaidAmount || 0);

  return { amount, currency };
}
