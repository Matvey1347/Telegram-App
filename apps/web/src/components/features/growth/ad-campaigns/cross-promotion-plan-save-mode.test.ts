import { describe, expect, it } from "vitest";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { shouldUpdateHistoricalPromotion } from "./cross-promotion-plan-save-mode";

const plan = (status: CrossPromotionPlan["status"], scheduledAt: string) =>
  ({ status, scheduledAt }) as CrossPromotionPlan;

describe("shouldUpdateHistoricalPromotion", () => {
  const now = Date.parse("2026-10-27T21:30:00.000Z");

  it("schedules publications for a draft even when its old anchor has passed", () => {
    expect(
      shouldUpdateHistoricalPromotion(
        plan("DRAFT", "2026-10-27T12:13:00.000Z"),
        now,
      ),
    ).toBe(false);
  });

  it("updates metadata for a historical active promotion", () => {
    expect(
      shouldUpdateHistoricalPromotion(
        plan("ACTIVE", "2026-10-26T12:13:00.000Z"),
        now,
      ),
    ).toBe(true);
  });

  it("schedules a future promotion", () => {
    expect(
      shouldUpdateHistoricalPromotion(
        plan("SCHEDULED", "2026-10-30T08:10:00.000Z"),
        now,
      ),
    ).toBe(false);
  });
});
