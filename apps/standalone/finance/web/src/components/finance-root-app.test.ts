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
  it("keeps a Telegram handle and ignores a URL instead of a handle", () => {
    expect(readFinanceContext({ financeBotId: "finance", supportBotUsername: "groshly_help_bot" })).toEqual({
      financeBotId: "finance",
      supportBotUsername: "groshly_help_bot",
    });
    expect(readFinanceContext({ financeBotId: "finance", supportBotUsername: "https://example.test" })).toEqual({
      financeBotId: "finance",
    });
  });
});
