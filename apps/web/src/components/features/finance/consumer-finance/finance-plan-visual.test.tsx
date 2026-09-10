import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinancePlanVisual } from "./finance-plan-visual";

describe("FinancePlanVisual", () => {
  it.each([
    ["FREE", "cash-flow"],
    ["PRO", "live-analytics"],
    ["ULTIMATE", "protected-intelligence"],
  ] as const)("renders a dedicated detailed %s scene", (tier, scene) => {
    const { container } = render(<FinancePlanVisual tier={tier} />);

    expect(
      container.querySelector(`[data-finance-plan-visual='${tier}']`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(`[data-finance-plan-scene='${scene}']`),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg defs, svg path, svg rect").length).toBeGreaterThan(6);
  });
});
