import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSalesWorkspaceHero } from "./ad-sales-workspace-hero";

describe("AdSalesWorkspaceHero", () => {
  it("changes the reporting range and active section from the shared workspace header", () => {
    const onRangeModeChange = vi.fn();
    const onTabChange = vi.fn();
    const onShiftRange = vi.fn();

    render(
      <AdSalesWorkspaceHero
        from={new Date("2026-08-24T10:00:00.000Z")}
        to={new Date("2026-08-30T10:00:00.000Z")}
        rangeMode="week"
        rangeSelection={null}
        activeTab="calendar"
        selectedNetworkId=""
        selectedChannelIds={[]}
        networks={[]}
        channels={[]}
        onRangeModeChange={onRangeModeChange}
        onRangeChange={vi.fn()}
        onShiftRange={onShiftRange}
        onToday={vi.fn()}
        onNetworkChange={vi.fn()}
        onChannelsChange={vi.fn()}
        onTabChange={onTabChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: /Deals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next reporting period" }));

    expect(onRangeModeChange).toHaveBeenCalledWith("month");
    expect(onTabChange).toHaveBeenCalledWith("sales");
    expect(onShiftRange).toHaveBeenCalledWith(1);
  });
});
