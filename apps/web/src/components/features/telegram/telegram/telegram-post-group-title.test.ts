import { describe, expect, it } from "vitest";
import type { TranslationKey } from "@/i18n/catalog";
import { telegramPostGroupTitle } from "./telegram-post-group-title";

const translations: Partial<Record<TranslationKey, string>> = {
  "telegramPosts.systemGroup.createdInTelegram": "Созданные в Telegram",
  "telegramPosts.systemGroup.advertise": "Реклама",
  "telegramPosts.systemGroup.systemBotPosts": "Публикации системного бота",
};
const translate = (key: TranslationKey) => translations[key] ?? key;

describe("telegramPostGroupTitle", () => {
  it.each([
    ["TELEGRAM_IMPORTED", "Созданные в Telegram"],
    ["ADVERTISE", "Реклама"],
    ["SYSTEM_BOT_POSTS", "Публикации системного бота"],
  ])("translates the stable system group key %s", (systemKey, expected) => {
    expect(
      telegramPostGroupTitle({ title: "Stored title", systemKey }, translate),
    ).toBe(expected);
  });

  it("preserves user and unknown group titles", () => {
    expect(
      telegramPostGroupTitle(
        { title: "My campaign", systemKey: null },
        translate,
      ),
    ).toBe("My campaign");
    expect(
      telegramPostGroupTitle(
        { title: "Future system group", systemKey: "FUTURE" },
        translate,
      ),
    ).toBe("Future system group");
  });
});
