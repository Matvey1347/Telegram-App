import { describe, expect, it } from "vitest";
import { telegramSystemBotKeys } from "./query-keys";

describe("telegramSystemBotKeys", () => {
  it("isolates task subscriptions by workspace", () => {
    expect(telegramSystemBotKeys.subscriptions("workspace-a")).toEqual([
      "telegram-system-bot",
      "subscriptions",
      "workspace-a",
    ]);
    expect(telegramSystemBotKeys.subscriptions("workspace-b")).not.toEqual(
      telegramSystemBotKeys.subscriptions("workspace-a"),
    );
  });
});
