import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./finance-controls";

const choices = [
  "Cash",
  "Card",
  "Savings",
  "Brokerage",
  "Travel",
  "Business",
];

describe("Finance Select keyboard lifecycle", () => {
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
    expect(screen.getByRole("listbox", { name: "Account" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    trigger.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("listbox", { name: "Account" })).toBeInTheDocument();
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
