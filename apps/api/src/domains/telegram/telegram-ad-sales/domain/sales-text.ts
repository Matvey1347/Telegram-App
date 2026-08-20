import { Prisma } from '@prisma/client';
import { decimal } from './decimal';

export const SALES_OFFER_ROUNDING_STEP = 10;

/** Rounds a presentation quote, never an accounting price. */
export function roundSalesOfferPrice(
  value: Prisma.Decimal.Value,
  step = SALES_OFFER_ROUNDING_STEP,
) {
  if (!Number.isFinite(step) || step <= 0) throw new Error('Rounding step must be positive');
  return decimal(value)
    .div(step)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .mul(step);
}

export const AD_PLACEMENT_DELETE_GRACE_MINUTES = 10;

export function calculateAdPlacementDeleteAt(input: {
  publishedAt: Date;
  deleteAfterHoursSnapshot: number | null;
  isPermanentSnapshot: boolean;
}) {
  if (input.isPermanentSnapshot || !input.deleteAfterHoursSnapshot) return null;
  return new Date(
    input.publishedAt.getTime() +
      (input.deleteAfterHoursSnapshot * 60 + AD_PLACEMENT_DELETE_GRACE_MINUTES) * 60 * 1000,
  );
}
