import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSaleDealPlacementActions } from "./ad-sale-deal-placement-actions";

vi.mock("@/components/ui/primitives", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  CustomSelect: ({ value, onChange, options, ...props }: any) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    >
      {options.map((option: { value: string; label: string }) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe("AdSaleDealPlacementActions", () => {
  it("applies only a format available in every placement channel", () => {
    const onApplyFormat = vi.fn().mockResolvedValue(undefined);
    render(
      <AdSaleDealPlacementActions
        sale={
          {
            placements: [
              { telegramChannelId: "channel-1" },
              { telegramChannelId: "channel-2" },
            ],
          } as never
        }
        productsByChannelId={{
          "channel-1": [
            { id: "first-24", name: "1/24" },
            { id: "first-48", name: "1/48" },
          ],
          "channel-2": [
            { id: "second-24", name: "1/24" },
          ],
        } as never}
        saving={false}
        onApplyFormat={onApplyFormat}
      />,
    );

    const select = screen.getByLabelText("Format for all placements");
    expect(screen.queryByRole("option", { name: "1/48" })).toBeNull();
    fireEvent.change(select, { target: { value: "1/24" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply to all/ }));

    expect(onApplyFormat).toHaveBeenCalledWith("1/24");
  });
});
