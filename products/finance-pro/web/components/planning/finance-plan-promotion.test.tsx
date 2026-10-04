import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceTierBadge } from "./finance-plan-promotion";

describe("FinanceTierBadge", () => {
  it.each([
    ["FREE", "border-[#22d3ee]/45"],
    ["PRO", "border-[#38bdf8]/50"],
    ["ULTIMATE", "border-[#a78bfa]/50"],
  ] as const)("matches the %s plan-card accent", (tier, accentClass) => {
    render(<FinanceTierBadge tier={tier} />);

    expect(screen.getByText(tier)).toHaveClass(accentClass);
  });
});
