import { financeCoreCopy, type FinanceLocale } from "./core";
const copy = {
  en: {
    expenseCategories: "Expense categories",
    selectCategory: "Select a category",
    monthlyBudget: "Monthly budget",
    saveBudget: "Save budget",
    exceeded: "Exceeded",
    remaining: "remaining",
    smartLimits: "Smart limits",
    checkingPro: "Checking your Finance Pro access…",
    projected: "projected",
    addBudgetForecast: "Add a budget to receive a forecast.",
    smartPro: "Smart forecasts are a Finance Pro feature.",
    upgradePlan: "View plans",
    historicalReason:
      "transactions predate currency valuation and cannot be compared safely.",
  },
  uk: {
    expenseCategories: "Категорії витрат",
    selectCategory: "Оберіть категорію",
    monthlyBudget: "Місячний бюджет",
    saveBudget: "Зберегти бюджет",
    exceeded: "Перевищено",
    remaining: "залишилося",
    smartLimits: "Розумні ліміти",
    checkingPro: "Перевіряємо доступ Finance Pro…",
    projected: "прогноз",
    addBudgetForecast: "Додайте бюджет, щоб отримати прогноз.",
    smartPro: "Розумні прогнози доступні у Finance Pro.",
    upgradePlan: "Переглянути тарифи",
    historicalReason:
      "операцій створено до оцінки валюти, тому їх не можна безпечно порівняти.",
  },
  ru: {
    expenseCategories: "Категории расходов",
    selectCategory: "Выберите категорию",
    monthlyBudget: "Месячный бюджет",
    saveBudget: "Сохранить бюджет",
    exceeded: "Превышено",
    remaining: "осталось",
    smartLimits: "Умные лимиты",
    checkingPro: "Проверяем доступ Finance Pro…",
    projected: "прогноз",
    addBudgetForecast: "Добавьте бюджет, чтобы получить прогноз.",
    smartPro: "Умные прогнозы доступны в Finance Pro.",
    upgradePlan: "Посмотреть тарифы",
    historicalReason:
      "операций создано до валютной оценки, поэтому их нельзя безопасно сравнить.",
  },
} as const;
export const financeBudgetCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
