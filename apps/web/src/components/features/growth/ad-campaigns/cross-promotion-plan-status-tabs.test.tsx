import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import {
  CrossPromotionPlanStatusTabs,
  plansForCrossPromotionTab,
} from "./cross-promotion-plan-status-tabs";

const plan = (status: CrossPromotionPlan["status"]) => ({ status }) as CrossPromotionPlan;

describe("CrossPromotionPlanStatusTabs", () => {
  it("keeps drafts in their own operational tab", () => {
    const plans = [plan("ACTIVE"), plan("SCHEDULED"), plan("DRAFT"), plan("COMPLETED"), plan("CANCELLED")];

    expect(plansForCrossPromotionTab(plans, "ACTIVE")).toHaveLength(1);
    expect(plansForCrossPromotionTab(plans, "DRAFT")).toHaveLength(1);
    expect(plansForCrossPromotionTab(plans, "SCHEDULED")).toHaveLength(1);
    expect(plansForCrossPromotionTab(plans, "COMPLETED")).toHaveLength(2);
  });

  it("shows counts and changes the selected tab", () => {
    const onChange = vi.fn();
    render(
      <CrossPromotionPlanStatusTabs
        plans={[plan("ACTIVE"), plan("SCHEDULED")]}
        value="ACTIVE"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("tab", { name: "Active 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Scheduled 1" }));
    expect(onChange).toHaveBeenCalledWith("SCHEDULED");
  });
});
