import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSaleDealPlacementActions } from "./ad-sale-deal-placement-actions";

vi.mock("@/components/ui/primitives", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  ),
  CustomSelect: ({
    value,
    onChange,
    options,
    ...props
  }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
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
  DateInput: ({ value, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
    <input type="date" value={value} {...props} />
  ),
  TimeInput: ({ value, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
    <input type="time" value={value} {...props} />
  ),
}));

describe("AdSaleDealPlacementActions", () => {
  it("applies only a format available in every placement channel", () => {
    const onApplyAll = vi.fn().mockResolvedValue(undefined);
    render(
      <AdSaleDealPlacementActions
        sale={
          {
            placements: [
              { telegramChannelId: "channel-1", scheduledAt: "2026-08-25T16:00:00.000Z", timezone: "Europe/Warsaw" },
              { telegramChannelId: "channel-2", scheduledAt: "2026-08-25T16:00:00.000Z", timezone: "Europe/Warsaw" },
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
        onApplyAll={onApplyAll}
      />,
    );

    const select = screen.getByLabelText("Format for all placements");
    expect(screen.queryByRole("option", { name: "1/48" })).toBeNull();
    fireEvent.change(select, { target: { value: "1/24" } });
    fireEvent.change(screen.getByLabelText("Date for all"), {
      target: { value: "2026-08-28" },
    });
    fireEvent.change(screen.getByLabelText("Time for all"), {
      target: { value: "19:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply all/ }));

    expect(onApplyAll).toHaveBeenCalledWith({
      formatName: "1/24",
      date: "2026-08-28",
      time: "19:30",
    });
  });
});
