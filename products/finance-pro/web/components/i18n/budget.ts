import { financeCoreCopy, type FinanceLocale } from "./core";
const copy = {
  en: {
    expenseCategories: "Expense categories",
    selectCategory: "Select a category",
    monthlyBudget: "Monthly budget",
    addBudget: "Add budget",
    actions: "Budget actions",
    deleteDescription:
      "The budget limit will be removed. Existing transactions will stay unchanged.",
    saveBudget: "Save budget",
    editBudget: "Edit budget",
    deleteBudget: "Delete budget",
    exceeded: "Exceeded",
    remaining: "remaining",
    smartLimits: "Smart limits",
    checkingPro: "Checking your Finance Pro access…",
    projected: "projected",
    addBudgetForecast: "Add a budget to receive a forecast.",
    smartPro:
      "See where your budget is heading before the month ends and adjust spending in time.",
    smartUpgrade: "Plan ahead with smart forecasts",
    planEyebrow: "Finance Pro",
    upgradePlan: "Unlock smart forecasts",
    historicalReason:
      "transactions predate currency valuation and cannot be compared safely.",
  },
  uk: {
    expenseCategories: "Категорії витрат",
    selectCategory: "Оберіть категорію",
    monthlyBudget: "Місячний бюджет",
    addBudget: "Додати бюджет",
    actions: "Дії з бюджетом",
    deleteDescription:
      "Ліміт бюджету буде видалено. Наявні операції не зміняться.",
    saveBudget: "Зберегти бюджет",
    editBudget: "Редагувати бюджет",
    deleteBudget: "Видалити бюджет",
    exceeded: "Перевищено",
    remaining: "залишилося",
    smartLimits: "Розумні ліміти",
    checkingPro: "Перевіряємо доступ Finance Pro…",
    projected: "прогноз",
    addBudgetForecast: "Додайте бюджет, щоб отримати прогноз.",
    smartPro:
      "Побачте, куди рухається бюджет, ще до завершення місяця, та вчасно скоригуйте витрати.",
    smartUpgrade: "Плануйте наперед із розумними прогнозами",
    planEyebrow: "Finance Pro",
    upgradePlan: "Відкрити розумні прогнози",
    historicalReason:
      "операцій створено до оцінки валюти, тому їх не можна безпечно порівняти.",
  },
  ru: {
    expenseCategories: "Категории расходов",
    selectCategory: "Выберите категорию",
    monthlyBudget: "Месячный бюджет",
    addBudget: "Добавить бюджет",
    actions: "Действия с бюджетом",
    deleteDescription:
      "Лимит бюджета будет удалён. Существующие операции не изменятся.",
    saveBudget: "Сохранить бюджет",
    editBudget: "Редактировать бюджет",
    deleteBudget: "Удалить бюджет",
    exceeded: "Превышено",
    remaining: "осталось",
    smartLimits: "Умные лимиты",
    checkingPro: "Проверяем доступ Finance Pro…",
    projected: "прогноз",
    addBudgetForecast: "Добавьте бюджет, чтобы получить прогноз.",
    smartPro:
      "Увидьте, к чему идёт бюджет, ещё до конца месяца и вовремя скорректируйте расходы.",
    smartUpgrade: "Планируйте заранее с умными прогнозами",
    planEyebrow: "Finance Pro",
    upgradePlan: "Открыть умные прогнозы",
    historicalReason:
      "операций создано до валютной оценки, поэтому их нельзя безопасно сравнить.",
  },
} as const;
export const financeBudgetCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
