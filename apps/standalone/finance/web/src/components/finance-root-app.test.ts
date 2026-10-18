import { describe, expect, it } from "vitest";
import { readFinanceContext } from "./finance-root-app";

describe("FinanceRootApp context", () => {
  it("accepts only a non-empty internal bot identifier", () => {
    expect(readFinanceContext({ financeBotId: "finance-primary" })).toEqual({
      financeBotId: "finance-primary",
    });
    expect(readFinanceContext({ financeBotId: "" })).toBeNull();
    expect(readFinanceContext({})).toBeNull();
  });
});
