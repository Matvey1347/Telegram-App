import type { CrossPromotionPlan } from "@telegram-system/shared";

export function shouldUpdateHistoricalPromotion(
  plan: CrossPromotionPlan | null,
  now = Date.now(),
) {
  return Boolean(
    plan &&
      plan.status !== "DRAFT" &&
      new Date(plan.scheduledAt).getTime() <= now,
  );
}
