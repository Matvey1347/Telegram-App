import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("uses one Finance date-range picker instead of native date inputs", () => {
    const onChange = vi.fn();
    render(
      <FinancePeriodSelector
        value={{
          period: "CUSTOM",
          from: "2026-09-01",
          to: "2026-09-30",
        }}
        locale="ru"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Период аналитики" }),
    ).toHaveTextContent("01.09.2026 - 30.09.2026");
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Период аналитики" }));
    const calendar = screen.getByRole("dialog", {
      name: "Выберите период",
    });
    fireEvent.click(within(calendar).getAllByRole("button", { name: "5" })[0]);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(calendar).getAllByRole("button", { name: "10" })[0]);
    expect(onChange).toHaveBeenCalledWith({
      period: "CUSTOM",
      from: "2026-09-05",
      to: "2026-09-10",
    });
  });
});
