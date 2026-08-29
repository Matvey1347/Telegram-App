import { describe, expect, it } from "vitest";
import { financeIconPickerCopy } from "./finance-icon-picker-i18n";

describe("financeIconPickerCopy", () => {
  it("owns the exact English picker labels", () => {
    expect(financeIconPickerCopy("en")).toEqual({
      addIcon: "Add icon",
      changeIcon: "Change icon",
      searchIcon: "Search icon by name",
      noStandardIcons: "No standard icons found.",
      people: "People",
      nature: "Nature",
      food: "Food",
      activity: "Activity",
      travel: "Travel",
      objects: "Objects",
      symbols: "Symbols",
      flags: "Flags",
    });
  });

  it("owns the exact Ukrainian picker labels", () => {
    expect(financeIconPickerCopy("uk")).toEqual({
      addIcon: "Додати емодзі",
      changeIcon: "Змінити емодзі",
      searchIcon: "Пошук емодзі за назвою",
      noStandardIcons: "Стандартних емодзі не знайдено.",
      people: "Люди",
      nature: "Природа",
      food: "Їжа",
      activity: "Активності",
      travel: "Подорожі",
      objects: "Предмети",
      symbols: "Символи",
      flags: "Прапори",
    });
  });
});
