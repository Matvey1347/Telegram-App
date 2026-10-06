import { describe, expect, it } from "vitest";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { plansForCrossPromotionTab } from "./cross-promotion-plan-status-tabs";

const plan = (status: CrossPromotionPlan["status"]) => ({ status }) as CrossPromotionPlan;

describe("cross-promotion status tabs", () => {
  it("keeps database drafts out of Scheduled", () => {
    const plans = [plan("DRAFT"), plan("SCHEDULED"), plan("ACTIVE")];

    expect(plansForCrossPromotionTab(plans, "DRAFT")).toEqual([plans[0]]);
    expect(plansForCrossPromotionTab(plans, "SCHEDULED")).toEqual([plans[1]]);
  });
});
