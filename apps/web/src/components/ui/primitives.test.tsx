import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeTimeInputValue,
  CustomSelect,
  isValidTimeInputValue,
  Input,
  Modal,
  Tooltip,
} from "@/components/ui/primitives";

describe("Modal", () => {
  it("exposes dialog semantics, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <Modal open onClose={onClose} title="Edit account" closeLabel="Close dialog">
        <button type="button">Save</button>
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Edit account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("CustomSelect", () => {
  it("renders the dropdown in a fixed overlay layer above surrounding layout", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CustomSelect
        value="draft"
        onChange={() => {}}
        searchable={false}
        options={[
          { value: "draft", label: "Draft" },
          { value: "publish", label: "Publish" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /draft/i }));

    const option = await screen.findByRole("button", { name: /publish/i });
    expect(container).not.toContainElement(option);
    expect(option.closest("div")?.className).toContain("z-[120]");
  });
});

describe("Tooltip", () => {
  it("renders content through a portal and closes on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <Tooltip content="Helpful tab description">
          <button type="button">Info</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Info" }));

    const tooltip = await screen.findByText("Helpful tab description");
    expect(container).not.toContainElement(tooltip);

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Helpful tab description")).toBeNull();
  });
});

describe("Input", () => {
  it("lets users reveal and hide every password field", async () => {
    const user = userEvent.setup();
    render(<Input type="password" defaultValue="secret-value" />);

    const input = screen.getByDisplayValue("secret-value");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("time input helpers", () => {
  it("accepts single-digit hours and canonicalizes them for saving", () => {
    expect(canonicalizeTimeInputValue("8:15")).toBe("08:15");
    expect(isValidTimeInputValue("8:15")).toBe(true);
  });

  it("rejects incomplete or out-of-range times", () => {
    expect(canonicalizeTimeInputValue("8:1")).toBeNull();
    expect(canonicalizeTimeInputValue("24:00")).toBeNull();
    expect(isValidTimeInputValue("24:00")).toBe(false);
  });
});
