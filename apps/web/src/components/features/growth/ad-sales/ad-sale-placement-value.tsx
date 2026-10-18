import type { TelegramAdSale } from "@telegram-system/shared";
import { formatCompactMoney } from "@/lib/features/finance/money";
import { nativeAdSalePayment } from "./ad-sale-native-payment";

export function adSaleClientName(sale: TelegramAdSale) {
  return (
    sale.advertiserTelegramSnapshot ||
    sale.advertiserTelegram ||
    sale.advertiserNameSnapshot ||
    sale.advertiserName ||
    "Client"
  );
}

export function AdSalePlacementValue({
  sale,
  placement,
}: {
  sale: TelegramAdSale;
  placement: TelegramAdSale["placements"][number];
}) {
  const allocations = (sale.payments ?? []).flatMap((payment) =>
    payment.status === "VOIDED"
      ? []
      : (payment.allocations ?? [])
          .filter(
            (allocation) =>
              allocation.telegramAdSalePlacementId === placement.id,
          )
          .map((allocation) => ({
            amount: Number(allocation.amount),
            currency: allocation.currency,
          })),
  );
  if (allocations.length) {
    const currency = allocations[0].currency;
    const amount = allocations
      .filter((allocation) => allocation.currency === currency)
      .reduce((sum, allocation) => sum + allocation.amount, 0);
    return (
      <span className="shrink-0 font-semibold text-white">
        {formatCompactMoney(amount, currency)}
      </span>
    );
  }
  const paid = nativeAdSalePayment(sale);
  const freePlacements = sale.placements.every(
    (item) => Number(item.agreedPrice) <= 0,
  );
  if (freePlacements && paid.amount > 0) {
    const index = sale.placements.findIndex((item) => item.id === placement.id);
    const minorUnitAmount = Math.round(paid.amount * 100);
    const base = Math.floor(minorUnitAmount / sale.placements.length);
    const amount =
      (base +
        (index === sale.placements.length - 1
          ? minorUnitAmount - base * sale.placements.length
          : 0)) /
      100;
    return (
      <span className="shrink-0 font-semibold text-white">
        {formatCompactMoney(amount, paid.currency)}
      </span>
    );
  }
  return (
    <span className="shrink-0 font-semibold text-white">
      {formatCompactMoney(placement.agreedPrice, placement.currency)}
    </span>
  );
}
