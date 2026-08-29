import type { EmojiCategory } from "@/lib/emoji-icons";
import type { FinanceLocale } from "../finance-i18n";

type FinanceIconPickerCopy = {
  addIcon: string;
  changeIcon: string;
  searchIcon: string;
  noStandardIcons: string;
} & Record<EmojiCategory, string>;

const copy: Record<FinanceLocale, FinanceIconPickerCopy> = {
  en: {
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
  },
  uk: {
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
  },
  ru: {
    addIcon: "Добавить эмодзи",
    changeIcon: "Изменить эмодзи",
    searchIcon: "Поиск эмодзи по названию",
    noStandardIcons: "Стандартные эмодзи не найдены.",
    people: "Люди",
    nature: "Природа",
    food: "Еда",
    activity: "Активности",
    travel: "Путешествия",
    objects: "Предметы",
    symbols: "Символы",
    flags: "Флаги",
  },
};

export function financeIconPickerCopy(locale: FinanceLocale) {
  return copy[locale];
}
