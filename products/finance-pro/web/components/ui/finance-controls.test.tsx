import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./finance-controls";

const choices = ["Cash", "Card", "Savings", "Brokerage", "Travel", "Business"];

describe("Finance Select keyboard lifecycle", () => {
  it("uses the semantic color for every financial operation type", async () => {
    const user = userEvent.setup();
    render(
      <Select triggerAriaLabel="Operation type" defaultValue="EXPENSE">
        <option value="EXPENSE">Expense</option>
        <option value="INCOME">Income</option>
        <option value="TRANSFER">Transfer</option>
        <option value="DEBT">Debt</option>
        <option value="INVESTMENT">Investment</option>
      </Select>,
    );

    await user.click(screen.getByRole("button", { name: "Operation type" }));

    expect(
      within(screen.getByRole("option", { name: "Expense" })).getByText(
        "Expense",
      ),
    ).toHaveClass("text-rose-300");
    expect(
      within(screen.getByRole("option", { name: "Income" })).getByText(
        "Income",
      ),
    ).toHaveClass("text-emerald-300");
    expect(
      within(screen.getByRole("option", { name: "Transfer" })).getByText(
        "Transfer",
      ),
    ).toHaveClass("text-sky-300");
    expect(
      within(screen.getByRole("option", { name: "Debt" })).getByText("Debt"),
    ).toHaveClass("text-amber-300");
    expect(
      within(screen.getByRole("option", { name: "Investment" })).getByText(
        "Investment",
      ),
    ).toHaveClass("text-violet-300");
  });

  it("opens once from Enter and Space without immediately toggling closed", async () => {
    const user = userEvent.setup();
    render(
      <Select triggerAriaLabel="Account" defaultValue="Cash">
        {choices.slice(0, 2).map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </Select>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("listbox", { name: "Account" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    trigger.focus();
    await user.keyboard(" ");
    expect(
      screen.getByRole("listbox", { name: "Account" }),
    ).toBeInTheDocument();
  });

  it("positions its menu above modal overflow boundaries", async () => {
    const user = userEvent.setup();
    render(
      <div className="overflow-hidden">
        <Select triggerAriaLabel="Account" defaultValue="Cash">
          {choices.slice(0, 2).map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </Select>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(
      screen.getByRole("listbox", { name: "Account" }).parentElement,
    ).toHaveClass("fixed");
  });

  it("returns focus to the trigger after committing an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        triggerAriaLabel="Account"
        defaultValue="Cash"
        onChange={onChange}
      >
        {choices.slice(0, 2).map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </Select>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    const card = screen.getByRole("option", { name: "Card" });
    card.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger when Escape closes searchable options", async () => {
    const user = userEvent.setup();
    render(
      <Select triggerAriaLabel="Account" defaultValue="Cash">
        {choices.map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </Select>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Account" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(choices.length);

    const search = screen.getByPlaceholderText("Search…");
    await user.type(search, "Car");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
