import { Prisma } from '@prisma/client';
import { decimal } from './decimal';

export const SALES_OFFER_ROUNDING_STEP = 10;
export const AD_PLACEMENT_DELETION_GRACE_HOURS = 1;

/** Rounds a presentation quote, never an accounting price. */
export function roundSalesOfferPrice(
  value: Prisma.Decimal.Value,
  step = SALES_OFFER_ROUNDING_STEP,
) {
  if (!Number.isFinite(step) || step <= 0)
    throw new Error('Rounding step must be positive');
  return decimal(value)
    .div(step)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .mul(step);
}

export function calculateAdPlacementDeleteAt(input: {
  scheduledAt: Date;
  publishedAt?: Date | null;
  deleteAfterHoursSnapshot: number | null;
  isPermanentSnapshot: boolean;
  graceHours?: number;
}) {
  if (input.isPermanentSnapshot || !input.deleteAfterHoursSnapshot) return null;
  const lifecycleStartedAt = input.publishedAt ?? input.scheduledAt;
  return new Date(
    lifecycleStartedAt.getTime() +
      (input.deleteAfterHoursSnapshot +
        (input.graceHours ?? AD_PLACEMENT_DELETION_GRACE_HOURS)) *
        60 *
        60 *
        1000,
  );
}
