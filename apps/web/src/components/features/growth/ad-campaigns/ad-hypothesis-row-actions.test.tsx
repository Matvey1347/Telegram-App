import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdHypothesisRowActions } from "./ad-hypothesis-row-actions";
import type { AdHypothesis } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";

function hypothesis(isSystem: boolean): AdHypothesis {
  return {
    id: isSystem ? "system:all-channels" : "hypothesis-1",
    name: isSystem ? "All channels" : "Creative test",
    status: "testing",
    createdAt: "2026-09-13T10:00:00.000Z",
    updatedAt: "2026-09-13T10:00:00.000Z",
    campaignsCount: 1,
    isSystem,
    summary: {
      campaignsCount: 1,
      totalSpend: 100,
      totalJoinedSubscribers: 10,
      totalPendingSubscribers: 0,
      totalAttributedSubscribers: 10,
      kpiStatus: "good",
      decision: "Scale",
    },
  };
}

describe("AdHypothesisRowActions", () => {
  it("opens trend for a system hypothesis without exposing mutation actions", async () => {
    const user = userEvent.setup();
    const row = hypothesis(true);
    const onOpenHistory = vi.fn();
    renderWithProviders(
      <AdHypothesisRowActions
        hypothesis={row}
        onOpenHistory={onOpenHistory}
        onEdit={vi.fn()}
        onToggleExclude={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Actions for All channels" }),
    );
    expect(
      screen.queryByRole("menuitem", { name: "Edit hypothesis" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Open trend" }));

    expect(onOpenHistory).toHaveBeenCalledWith(row);
  });
});
