import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceSavingsGoal } from "@telegram-system/shared";
import { FinanceSavingsGoalCard } from "./finance-savings-goal-card";

const completed: ConsumerFinanceSavingsGoal = {
  id: "goal",
  name: "Emergency fund",
  targetAmount: "100",
  currency: "USD",
  status: "COMPLETED",
  currentAllocated: "100",
  linkedAllocated: "100",
  legacyUnlinkedAmount: "0",
  backedAmount: "100",
  remainingAmount: "0",
  progressPercentage: 100,
  fundingStatus: "BACKED",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
};

describe("FinanceSavingsGoalCard completed workflow", () => {
  it("keeps release, reallocate-out, history and archive while hiding active-only actions", () => {
    const onAction = vi.fn();
    const onHistory = vi.fn();
    const onArchive = vi.fn();
    render(
      <FinanceSavingsGoalCard
        goal={completed}
        locale="en"
        onEdit={vi.fn()}
        onAction={onAction}
        onHistory={onHistory}
        onComplete={vi.fn()}
        onArchive={onArchive}
      />,
    );
    expect(screen.queryByRole("button", { name: "Allocate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit goal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onAction).toHaveBeenNthCalledWith(1, "RELEASE");
    expect(onAction).toHaveBeenNthCalledWith(2, "REALLOCATE");
    expect(onHistory).toHaveBeenCalledOnce();
    expect(onArchive).toHaveBeenCalledOnce();
  });
});
