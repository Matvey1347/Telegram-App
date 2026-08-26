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
        selectionMode="channels"
        selectedNetworkId=""
        selectedChannelIds={[]}
        networks={[]}
        channels={[]}
        onRangeModeChange={onRangeModeChange}
        onRangeChange={vi.fn()}
        onShiftRange={onShiftRange}
        onToday={vi.fn()}
        onSelectionModeChange={vi.fn()}
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

  it("shows one emoji network selector or the channel selector at a time", async () => {
    const onSelectionModeChange = vi.fn();
    const commonProps = {
      from: new Date("2026-08-24T10:00:00.000Z"),
      to: new Date("2026-08-30T10:00:00.000Z"),
      rangeMode: "week" as const,
      rangeSelection: null,
      activeTab: "calendar" as const,
      selectedNetworkId: "network-all",
      selectedChannelIds: [],
      networks: [
        {
          id: "network-all",
          name: "All",
          systemKey: "ALL",
          iconPresentation: { type: "unicode", value: "🌐" },
        },
        {
          id: "network-improvement",
          name: "Improvement",
          systemKey: null,
          iconPresentation: { type: "unicode", value: "🧘" },
        },
      ] as never,
      channels: [],
      onRangeModeChange: vi.fn(),
      onRangeChange: vi.fn(),
      onShiftRange: vi.fn(),
      onToday: vi.fn(),
      onSelectionModeChange,
      onNetworkChange: vi.fn(),
      onChannelsChange: vi.fn(),
      onTabChange: vi.fn(),
    };
    const { rerender } = render(
      <AdSalesWorkspaceHero {...commonProps} selectionMode="network" />,
    );

    expect(screen.queryByText("All networks")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose channels" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(
      (await screen.findByRole("button", { name: /Improvement/ })).textContent,
    ).toContain("🧘");

    fireEvent.click(screen.getByRole("button", { name: "Channels" }));
    expect(onSelectionModeChange).toHaveBeenCalledWith("channels");

    rerender(
      <AdSalesWorkspaceHero {...commonProps} selectionMode="channels" />,
    );
    expect(screen.getByRole("button", { name: "Choose channels" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /All/ })).toBeNull();
  });
});
