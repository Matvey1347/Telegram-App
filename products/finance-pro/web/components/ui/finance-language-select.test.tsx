import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { financeCoreCopy } from "../i18n/core";
import { FinanceLanguageSelect } from "./finance-language-select";

describe("FinanceLanguageSelect", () => {
  it("shows flags only while preserving listbox names and keyboard navigation", () => {
    render(
      <FinanceLanguageSelect
        value="uk"
        copy={financeCoreCopy("uk")}
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Мова" });
    expect(trigger).toHaveClass("!justify-start");
    expect(within(trigger).getByText("Українська")).toHaveClass("sr-only");
    expect(within(trigger).getByText("🇺🇦")).toHaveClass("text-[22px]");
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox", { name: "Мова" });
    const russian = within(listbox).getByRole("option", { name: "Російська" });
    const english = within(listbox).getByRole("option", { name: "Англійська" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);
    expect(
      within(listbox).queryByRole("option", { name: "Українська" }),
    ).not.toBeInTheDocument();
    expect(within(russian).getByText("Російська")).toHaveClass("sr-only");
    expect(russian).toHaveClass("justify-center");

    russian.focus();
    fireEvent.keyDown(russian, { key: "ArrowDown" });
    expect(english).toHaveFocus();
    fireEvent.keyDown(english, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });
});
