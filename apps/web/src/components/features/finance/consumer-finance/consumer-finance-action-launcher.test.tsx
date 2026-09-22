import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { financeCoreCopy } from "./i18n/core";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";

describe("ConsumerFinanceActionLauncher", () => {
  it("shows only neutral expense, income and transfer actions in the header", () => {
    const onAction = vi.fn();
    render(<ConsumerFinanceActionLauncher copy={financeCoreCopy("ru")} onAction={onAction} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.textContent)).toEqual(["Расход", "Доход", "Переводы"]);
    expect(buttons[0]).not.toHaveClass("bg-sky-500");
    fireEvent.click(buttons[0]);
    expect(onAction).toHaveBeenCalledWith("expense");
  });
});
