import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FinancePeriodSelector,
  financePeriodDateRange,
} from "./finance-period-selector";

describe("FinancePeriodSelector", () => {
  it("emits a reusable finance period and shows recognizable icons", () => {
    const onChange = vi.fn();
    const { container } = render(
      <FinancePeriodSelector
        value={{ period: "CURRENT_MONTH" }}
        locale="ru"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /прошлый месяц/i }));
    expect(onChange).toHaveBeenCalledWith({ period: "PREVIOUS_MONTH" });
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });

  it("maps presets to inclusive calendar date filters", () => {
    expect(
      financePeriodDateRange(
        { period: "CURRENT_MONTH" },
        new Date(2026, 8, 14),
      ),
    ).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
});
