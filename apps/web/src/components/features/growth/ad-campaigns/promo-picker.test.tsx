import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromoPicker } from "./promo-picker";

const promos = [
  { id: "archived", title: "Archived creative", archivedAt: "2026-10-01" },
  { id: "active", title: "Current creative", status: "active" as const },
];

describe("PromoPicker", () => {
  it("shows active promos first and lets campaigns select archived promos", () => {
    const onChange = vi.fn();
    render(<PromoPicker multiple value={[]} onChange={onChange} promos={promos} placeholder="Select promos" />);
    fireEvent.click(screen.getByRole("button", { name: "Select promos" }));

    const active = screen.getByText("Current creative");
    const archived = screen.getByText("Archived creative");
    expect(active.compareDocumentPosition(archived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Active")).toBeVisible();
    fireEvent.click(archived);
    expect(onChange).toHaveBeenCalledWith(["archived"]);
  });

  it("keeps the selected archived promo visible with the same title", () => {
    render(<PromoPicker multiple value={["archived"]} onChange={vi.fn()} promos={promos} placeholder="Select promos" />);
    expect(screen.getByText("Archived creative")).toBeVisible();
    expect(screen.queryByText("Active")).toBeNull();
  });
});
