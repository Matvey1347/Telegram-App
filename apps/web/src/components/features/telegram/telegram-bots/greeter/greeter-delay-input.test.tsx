import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GreeterDelayInput, preferredDelayUnit } from "./greeter-delay-input";

describe("GreeterDelayInput", () => {
  it("chooses readable units and persists a normalized integer duration", async () => {
    const onChange = vi.fn();
    render(
      <GreeterDelayInput
        index={0}
        delaySeconds={86400}
        unit="days"
        onUnitChange={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(preferredDelayUnit(86400)).toBe("days");
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(172800);
  });
});
