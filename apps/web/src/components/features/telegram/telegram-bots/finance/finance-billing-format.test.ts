import { describe, expect, it } from "vitest";
import { formatBillingMoney, toMinorUnits } from "./finance-billing-format";

describe("Finance billing display", () => {
  it("formats minor units as a human price", () => {
    expect(formatBillingMoney(9_900, "UAH")).not.toContain("9900");
    expect(formatBillingMoney(9_900, "UAH")).toContain("99");
  });

  it("converts a human price to immutable price-version minor units", () => {
    expect(toMinorUnits("99.00")).toBe(9_900);
    expect(toMinorUnits("99,50")).toBe(9_950);
    expect(toMinorUnits("not a number")).toBeNull();
  });
});
