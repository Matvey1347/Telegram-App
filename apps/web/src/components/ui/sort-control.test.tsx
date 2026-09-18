import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortControl } from "./sort-control";

describe("SortControl", () => {
  it("changes the field and toggles the direction accessibly", async () => {
    const onFieldChange = vi.fn();
    const onDirectionChange = vi.fn();
    render(
      <SortControl
        field="date"
        options={[
          { value: "date", label: "Date" },
          { value: "cost", label: "Cost" },
        ]}
        direction="DESC"
        onFieldChange={onFieldChange}
        onDirectionChange={onDirectionChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Sort by" }));
    await userEvent.click(screen.getByRole("button", { name: "Cost" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Change to Ascending/i }),
    );

    expect(onFieldChange).toHaveBeenCalledWith("cost");
    expect(onDirectionChange).toHaveBeenCalledWith("ASC");
  });
});
