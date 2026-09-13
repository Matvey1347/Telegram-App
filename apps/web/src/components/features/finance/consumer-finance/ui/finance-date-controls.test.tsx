import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DateInput } from "./finance-date-controls";

describe("consumer Finance DateInput", () => {
  it("renders above an overflow-clipped finance modal", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <DateInput lang="ru" value="2026-09-13" onChange={() => {}} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "13.09.2026" }));

    const calendar = screen.getByRole("dialog", { name: "Выберите дату" });
    expect(container).not.toContainElement(calendar);
    expect(calendar).toHaveStyle({ position: "fixed" });
    expect(calendar).toHaveClass("z-[220]");
  });
});
