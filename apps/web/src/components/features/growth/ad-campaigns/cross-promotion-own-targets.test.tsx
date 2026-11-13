import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrossPromotionOwnTargets } from "./cross-promotion-own-targets";
vi.mock("../common-ad-slot-options", () => ({ CommonAdSlotOptions: ({ channelIds, date, onSelect }: { channelIds: string[]; date: string; onSelect: (time: string) => void }) => <button onClick={() => onSelect("10:10")}>Slots {channelIds.join(",")} {date}</button> }));
describe("own-channel advertising slots", () => {
  it("offers slots for publisher channels and applies a chosen time", () => {
    const onTimeChange = vi.fn();
    render(<CrossPromotionOwnTargets channels={[]} publisherIds={["publisher"]} targetIds={["promoted"]} date="2026-12-01" time="09:00" onDateChange={vi.fn()} onTimeChange={onTimeChange} targets={[]} onTargetIdsChange={vi.fn()} onTargetsChange={vi.fn()} onResolved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Slots publisher 2026-12-01" }));
    expect(onTimeChange).toHaveBeenCalledWith("10:10");
    expect(screen.queryByText(/Slots promoted/)).toBeNull();
  });
});
