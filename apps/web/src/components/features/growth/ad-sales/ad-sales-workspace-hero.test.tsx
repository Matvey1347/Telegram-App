import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSalesWorkspaceHero } from "./ad-sales-workspace-hero";

describe("AdSalesWorkspaceHero", () => {
  it("changes the slot reporting range", () => {
    const onRangeModeChange = vi.fn();
    const onShiftRange = vi.fn();

    render(
      <AdSalesWorkspaceHero
        from={new Date("2026-08-24T10:00:00.000Z")}
        to={new Date("2026-08-30T10:00:00.000Z")}
        rangeMode="week"
        rangeSelection={null}
        onRangeModeChange={onRangeModeChange}
        onRangeChange={vi.fn()}
        onShiftRange={onShiftRange}
        onToday={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next slot period" }));

    expect(onRangeModeChange).toHaveBeenCalledWith("month");
    expect(onShiftRange).toHaveBeenCalledWith(1);
  });

  it("does not render a competing Ad Sales tab bar", () => {
    render(
      <AdSalesWorkspaceHero
        from={new Date("2026-08-24T10:00:00.000Z")}
        to={new Date("2026-08-30T10:00:00.000Z")}
        rangeMode="week"
        rangeSelection={null}
        onRangeModeChange={vi.fn()}
        onRangeChange={vi.fn()}
        onShiftRange={vi.fn()}
        onToday={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Ad sales sections" }),
    ).toBeNull();
  });
});
