import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarPostGroupSection } from "./calendar-post-group-section";

describe("CalendarPostGroupSection", () => {
  it("collapses and expands its posts from the group header", () => {
    render(
      <CalendarPostGroupSection
        title="Small Morning"
        count={2}
        icon={<span>🌱</span>}
      >
        <div>First post</div>
        <div>Second post</div>
      </CalendarPostGroupSection>,
    );

    const toggle = screen.getByRole("button", { name: /Small Morning 2/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First post")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("First post")).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First post")).toBeInTheDocument();
  });
});
