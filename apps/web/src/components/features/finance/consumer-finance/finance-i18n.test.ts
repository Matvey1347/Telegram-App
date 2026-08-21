import { describe, expect, it } from "vitest";
import {
  financeCopy,
  localizeFinanceCategory,
  normalizeFinanceLocale,
  supportedFinanceLocales,
} from "./finance-i18n";

describe("consumer finance i18n", () => {
  it("keeps every supported locale in key parity", () => {
    const keys = Object.keys(financeCopy("en")).sort();
    for (const locale of supportedFinanceLocales)
      expect(Object.keys(financeCopy(locale)).sort()).toEqual(keys);
  });

  it("switches copy and localizes keyed default categories", () => {
    expect(normalizeFinanceLocale("uk-UA")).toBe("uk");
    expect(financeCopy("ru").transfers).toBe("Переводы");
    expect(localizeFinanceCategory("Food", "food", "uk")).toBe("Їжа");
    expect(localizeFinanceCategory("Fuel", "fuel", "uk")).toBe("Паливо");
    expect(localizeFinanceCategory("Other income", "other-income", "ru")).toBe(
      "Другие доходы",
    );
    expect(localizeFinanceCategory("Custom", null, "uk")).toBe("Custom");
  });
});
