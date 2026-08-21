import type { FinanceLocale } from "./finance-i18n";

const categoryNames: Record<string, Record<FinanceLocale, string>> = {
  food: { en: "Food", uk: "Їжа", ru: "Еда" },
  transport: { en: "Transport", uk: "Транспорт", ru: "Транспорт" },
  fuel: { en: "Fuel", uk: "Паливо", ru: "Топливо" },
  home: { en: "Home", uk: "Дім", ru: "Дом" },
  subscriptions: { en: "Subscriptions", uk: "Підписки", ru: "Подписки" },
  shopping: { en: "Shopping", uk: "Покупки", ru: "Покупки" },
  "other-income": {
    en: "Other income",
    uk: "Інші доходи",
    ru: "Другие доходы",
  },
  housing: { en: "Housing", uk: "Житло", ru: "Жильё" },
  health: { en: "Health", uk: "Здоров’я", ru: "Здоровье" },
  entertainment: { en: "Entertainment", uk: "Розваги", ru: "Развлечения" },
  salary: { en: "Salary", uk: "Зарплата", ru: "Зарплата" },
  gifts: { en: "Gifts", uk: "Подарунки", ru: "Подарки" },
  other: { en: "Other", uk: "Інше", ru: "Другое" },
  uncategorized: {
    en: "Uncategorized",
    uk: "Без категорії",
    ru: "Без категории",
  },
};

export function localizeFinanceCategory(
  name: string,
  key: string | null | undefined,
  locale: FinanceLocale,
) {
  return key ? (categoryNames[key.toLowerCase()]?.[locale] ?? name) : name;
}
