import { describe, expect, it } from "vitest";
import {
  emojiLocalizedSearchTerms,
  normalizeUiLocale,
  uiCopy,
} from "./ui-i18n";

describe("shared UI localization", () => {
  it.each([
    ["ru-RU", "ru"],
    ["uk-UA", "uk"],
    ["de-DE", "en"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeUiLocale(input)).toBe(expected);
  });

  it("provides localized searchable-control copy", () => {
    expect(uiCopy("ru")).toMatchObject({
      search: "Поиск…",
      selectPeriod: "Выберите период",
      clear: "Очистить",
    });
    expect(uiCopy("uk")).toMatchObject({
      search: "Пошук…",
      selectPeriod: "Оберіть період",
      clear: "Очистити",
    });
  });

  it("adds Russian and Ukrainian aliases to global emoji search", () => {
    expect(emojiLocalizedSearchTerms("money bag", "objects", "ru")).toContain(
      "деньги",
    );
    expect(emojiLocalizedSearchTerms("coffee", "food", "uk")).toContain("кава");
    expect(emojiLocalizedSearchTerms("money bag", "objects", "en")).toBe("");
  });
});
