import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CustomSelect, DateInput, Modal, Select } from "./primitives";
import { overlayPortalHost } from "./overlay-portal-host";

function Harness() {
  const [value, setValue] = useState("first");
  const [open, setOpen] = useState(true);
  return <dialog open data-testid="native-dialog"><Modal open={open} onClose={() => setOpen(false)} title="Nested reminder"><CustomSelect value={value} onChange={setValue} ariaLabel="Status choices" searchable={false} options={[{ value: "first", label: "First" }, { value: "second", label: "Second" }]} />
    <DateInput aria-label="Follow-up date" value="2026-10-31" onChange={() => undefined} />
    <p>Reminder fields</p></Modal>
  </dialog>;
}
describe("overlay top-layer host", () => {
  it("uses the document body without a native dialog", () => {
    expect(overlayPortalHost()).toBe(document.body);
  });
  it("keeps selectors and nested modal content inside the open native dialog", async () => {
    render(<Harness />);
    const host = screen.getByTestId("native-dialog");
    expect(host).toContainElement(screen.getByRole("dialog", { name: "Nested reminder" }));
    const trigger = screen.getByRole("button", { name: "Status choices" });
    await userEvent.click(trigger);
    const option = screen.getByRole("button", { name: "Second" });
    expect(host).toContainElement(option);
    expect(screen.getByRole("dialog", { name: "Nested reminder" })).toContainElement(option);
    await userEvent.click(option);
    expect(trigger).toHaveTextContent("Second");
  });
  it("keeps legacy Select options inside the parent modal focus boundary and consumes only the first Escape", async () => {
    render(<dialog open><Modal open onClose={() => undefined} title="Select reminder"><Select value="first" onChange={() => undefined}><option value="first">First choice</option><option value="second">Second choice</option></Select></Modal></dialog>);
    const trigger = screen.getByRole("button", { name: "First choice" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Select reminder" })).toContainElement(screen.getByRole("option", { name: "Second choice" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("option", { name: "Second choice" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Select reminder" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("keeps a calendar interactive inside the native dialog and closes only its popover on Escape", async () => {
    const change = vi.fn();
    render(<dialog open data-testid="native-dialog"><Modal open title="Calendar reminder" onClose={() => undefined}><DateInput aria-label="Due date" value="2026-10-31" onChange={change} /></Modal></dialog>);
    const trigger = screen.getByRole("button", { name: "Select Due date" });
    await userEvent.click(trigger);
    expect(screen.getByTestId("native-dialog")).toContainElement(screen.getByRole("dialog", { name: "Select start date" }));
    expect(screen.getByRole("dialog", { name: "Calendar reminder" })).toContainElement(screen.getByRole("dialog", { name: "Select start date" }));
    await userEvent.click(screen.getByRole("button", { name: "15" }));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: "2026-10-15" }) }));
    await userEvent.click(trigger);
    screen.getByRole("button", { name: "16" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Select start date" })).not.toBeInTheDocument();
    expect(screen.getByTestId("native-dialog")).toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });
  it("Escape dismisses the selector before the parent modal and restores trigger focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Status choices" });
    await userEvent.click(trigger);
    const cancel = vi.fn(); screen.getByTestId("native-dialog").addEventListener("cancel", cancel);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Second" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nested reminder" })).toBeInTheDocument();
    expect(trigger).toHaveFocus(); expect(cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Nested reminder" })).not.toBeInTheDocument();
  });
});
