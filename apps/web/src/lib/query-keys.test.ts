import { describe, expect, it } from "vitest";
import { greeterKeys, telegramSystemBotKeys } from "./query-keys";

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

describe("greeterKeys", () => {
  it("isolates bot resources and filtered pages", () => {
    expect(greeterKeys.overview("bot-a")).toEqual([
      "greeter",
      "bot-a",
      "overview",
    ]);
    expect(greeterKeys.users("bot-a", { page: 2, state: "ALIVE" })).not.toEqual(
      greeterKeys.users("bot-a", { page: 1, state: "ALIVE" }),
    );
    expect(greeterKeys.sequence("bot-a", "sequence-a")).not.toEqual(
      greeterKeys.sequence("bot-b", "sequence-a"),
    );
  });
});
