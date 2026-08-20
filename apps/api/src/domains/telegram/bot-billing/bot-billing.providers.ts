import type { BotBillingInterval, BotBillingProviderCapabilities } from '@telegram-system/shared';

export const BILLING_PROVIDER_CAPABILITIES: Record<
  'STRIPE' | 'TELEGRAM_STARS',
  BotBillingProviderCapabilities
> = {
  STRIPE: {
    recurring: true,
    intervals: ['MONTH', 'YEAR'],
    coupons: true,
    refunds: true,
  },
  // Telegram currently permits recurring bot invoices only every 30 days.
  TELEGRAM_STARS: {
    recurring: true,
    intervals: ['MONTH'],
    currencies: ['XTR'],
    coupons: false,
    refunds: true,
  },
};

export function supportsBillingPrice(input: {
  provider: 'STRIPE' | 'TELEGRAM_STARS';
  interval: BotBillingInterval;
  currency: string;
}) {
  const capabilities = BILLING_PROVIDER_CAPABILITIES[input.provider];
  return (
    capabilities.intervals.includes(input.interval) &&
    (!capabilities.currencies || capabilities.currencies.includes(input.currency))
  );
}
