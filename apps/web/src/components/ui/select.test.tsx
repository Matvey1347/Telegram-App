import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select";
describe("shared Select contract", () => {
  it("submits the selected value by name, preserves external form ownership and skips disabled controls", async () => {
    const { container } = render(
      <>
        <form id="settings-form" />
        <Select
          form="settings-form"
          name="modelId"
          aria-label="Model"
          defaultValue="cheap"
        >
          <option value="cheap">Economical model</option>
          <option value="quality">Personalization model</option>
        </Select>
        <Select
          form="settings-form"
          name="disabledValue"
          disabled
          defaultValue="hidden"
        >
          <option value="hidden">Disabled model</option>
        </Select>
      </>,
    );
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("modelId")).toBe("cheap");
    await userEvent.click(screen.getByRole("button", { name: "Model" }));
    await userEvent.click(
      screen.getByRole("option", { name: "Personalization model" }),
    );
    expect(new FormData(form).get("modelId")).toBe("quality");
    expect(new FormData(form).has("disabledValue")).toBe(false);
  });
  it("connects a visible label/id to the trigger and exposes expanded selection state", async () => {
    render(
      <>
        <label htmlFor="tone-select">Message tone</label>
        <Select id="tone-select" defaultValue="natural">
          <option value="natural">Natural</option>
          <option value="direct">Direct</option>
        </Select>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Message tone" });
    expect(screen.getByLabelText("Message tone")).toBe(trigger);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Natural" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("supports arrow navigation, Enter selection and imperative focus without mouse input", async () => {
    const ref = createRef<HTMLButtonElement>();
    const loadOptions = vi.fn();
    render(
      <Select
        ref={ref}
        onFocus={loadOptions}
        aria-label="Review status"
        defaultValue="pending"
      >
        <option value="pending">Pending</option>
        <option value="blocked" disabled>
          Blocked
        </option>
        <option value="approved">Approved</option>
      </Select>,
    );
    ref.current?.focus();
    fireEvent.keyDown(ref.current!, { key: "ArrowDown" });
    expect(loadOptions).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Pending" })).toHaveFocus(),
    );
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(ref.current).toHaveTextContent("Approved");
    expect(ref.current).toHaveFocus();
  });
});
