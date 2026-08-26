import type { TelegramAdProduct } from '@telegram-system/shared';

export const TELEGRAM_AD_SALES_STANDARD_PRODUCT_NAMES = new Set([
  '1/24',
  '2/48',
  '3/72',
  'No auto-delete',
]);

export function telegramAdSalesStandardProducts(products: TelegramAdProduct[]) {
  return products
    .filter(
      (product) =>
        product.isActive &&
        TELEGRAM_AD_SALES_STANDARD_PRODUCT_NAMES.has(product.name),
    )
    .slice(0, TELEGRAM_AD_SALES_STANDARD_PRODUCT_NAMES.size)
    .map((product) => ({
      id: product.id,
      name: product.name,
      currency: product.currency,
      topDurationMinutes: product.topDurationMinutes,
      feedDurationHours: product.feedDurationHours,
      deleteAfterHours: product.deleteAfterHours,
      isPermanent: product.isPermanent,
    }));
}
