import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test/render-with-i18n";
import { CalendarManualSchedulerPanel } from "./calendar-manual-scheduler-panel";

describe("CalendarManualSchedulerPanel", () => {
  it("keeps manual slot scheduling visible without format controls", () => {
    const onClear = vi.fn();

    renderWithI18n(
      <CalendarManualSchedulerPanel
        candidateCount={2}
        selectedCount={1}
        busy={false}
        onClear={onClear}
      >
        <div>Slot or custom time picker</div>
      </CalendarManualSchedulerPanel>,
    );

    expect(
      screen.getByRole("heading", { name: "Schedule multiple posts" }),
    ).toBeVisible();
    expect(screen.getByText("Slot or custom time picker")).toBeVisible();
    expect(screen.queryByText("Formats")).not.toBeInTheDocument();
    expect(screen.getByText("1 selected")).toHaveClass("whitespace-nowrap");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("shows the existing empty state when there are no draft posts", () => {
    renderWithI18n(
      <CalendarManualSchedulerPanel
        candidateCount={0}
        selectedCount={0}
        busy={false}
        onClear={() => undefined}
      >
        <div>Hidden picker</div>
      </CalendarManualSchedulerPanel>,
    );

    expect(
      screen.getByText("No drafts yet. Create a draft first."),
    ).toBeVisible();
    expect(screen.queryByText("Hidden picker")).not.toBeInTheDocument();
  });
});
