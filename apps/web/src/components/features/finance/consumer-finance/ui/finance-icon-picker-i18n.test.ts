import { describe, expect, it } from "vitest";
import { financeIconPickerCopy } from "./finance-icon-picker-i18n";

describe("financeIconPickerCopy", () => {
  it("owns the exact English picker labels", () => {
    expect(financeIconPickerCopy("en")).toEqual({
      addIcon: "Add icon",
      changeIcon: "Change icon",
      searchIcon: "Search icon by name",
      noStandardIcons: "No standard icons found.",
      icons: "Icons",
      image: "Image",
      remove: "Remove",
      uploadImage: "Upload image",
      dropImage: "Drop or paste an image here",
      uploadingImage: "Uploading image…",
      readyOnce: "Ready to use once",
      preview: "Preview",
      useOnce: "Use once",
      saveCustomIcon: "Save for reuse",
      iconName: "Icon name",
      iconNameExample: "For example, My card",
      save: "Save icon",
      back: "Back to icons",
      customIcons: "Saved images",
      noCustomIcons: "No saved images yet.",
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
      icons: "Емодзі",
      image: "Зображення",
      remove: "Прибрати",
      uploadImage: "Завантажити зображення",
      dropImage: "Перетягніть або вставте зображення сюди",
      uploadingImage: "Завантаження зображення…",
      readyOnce: "Готово до одноразового використання",
      preview: "Перегляд",
      useOnce: "Використати один раз",
      saveCustomIcon: "Зберегти для повторного використання",
      iconName: "Назва іконки",
      iconNameExample: "Наприклад, Моя картка",
      save: "Зберегти іконку",
      back: "Назад до емодзі",
      customIcons: "Збережені зображення",
      noCustomIcons: "Збережених зображень ще немає.",
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
