import { describe, expect, it } from "vitest";
import { formatCalendarTransactionMoney } from "./ad-sales-calendar-tab";

describe("formatCalendarTransactionMoney", () => {
  it("returns only the transaction currency without converted variants", () => {
    const label = formatCalendarTransactionMoney(60, "UAH");

    expect(label).toBe("60.00 UAH");
    expect(label).not.toContain("USD");
    expect(label).not.toContain("PLN");
    expect(label).not.toContain("/");
  });
});
