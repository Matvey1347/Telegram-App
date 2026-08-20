export const supportedFinanceLocales = ["uk", "ru", "en"] as const;
export type FinanceLocale = (typeof supportedFinanceLocales)[number];

type FinanceCopy = {
  home: string;
  transactions: string;
  analytics: string;
  accounts: string;
  settings: string;
  categories: string;
  overview: string;
  opening: string;
  loadingFinances: string;
  retry: string;
  financeUnavailable: string;
  openInTelegram: string;
  general: string;
  language: string;
  mainCurrency: string;
  timezone: string;
  save: string;
  saving: string;
  currencyHelp: string;
  manageCategories: string;
  categoriesHelp: string;
  plan: string;
  proActive: string;
  proDescription: string;
  dataPrivacy: string;
  exportData: string;
  onboardingTitle: string;
  onboardingExample: string;
  onboardingCurrency: string;
  onboardingCurrencyHelp: string;
  onboardingChat: string;
  onboardingChatHelp: string;
  continue: string;
  finish: string;
  expenseCategories: string;
  incomeCategories: string;
  addCategory: string;
  categoryName: string;
  archive: string;
  noCategories: string;
};

const copy: Record<FinanceLocale, FinanceCopy> = {
  en: {
    home: "Home", transactions: "Transactions", analytics: "Analytics", accounts: "Accounts", settings: "Settings", categories: "Categories", overview: "Overview", opening: "Opening Finance…", loadingFinances: "Loading your finances…", retry: "Retry", financeUnavailable: "Finance could not be loaded.", openInTelegram: "Open Finance from its Telegram bot. Browser parameters cannot authenticate this Mini App.", general: "General", language: "Language", mainCurrency: "Main currency", timezone: "Timezone", save: "Save", saving: "Saving…", currencyHelp: "Totals and analytics will be shown in this currency. Your account currencies will not change.", manageCategories: "Manage categories", categoriesHelp: "Categories help you see where your money goes.", plan: "Plan", proActive: "Finance Pro is active.", proDescription: "Unlock smart limits and helpful insights with Pro.", dataPrivacy: "Data and privacy", exportData: "Export data", onboardingTitle: "Track income and expenses in seconds", onboardingExample: "250 coffee\n+3000 salary", onboardingCurrency: "Choose your main currency", onboardingCurrencyHelp: "You can change this later in Settings.", onboardingChat: "Quick entries work in the bot", onboardingChatHelp: "Use the Mini App to view, analyse and edit your finances.", continue: "Continue", finish: "Open my finances", expenseCategories: "Expense categories", incomeCategories: "Income categories", addCategory: "Add category", categoryName: "Category name", archive: "Archive", noCategories: "No categories yet.",
  },
  uk: {
    home: "Головна", transactions: "Операції", analytics: "Аналітика", accounts: "Рахунки", settings: "Налаштування", categories: "Категорії", overview: "Огляд", opening: "Відкриваємо Фінанси…", loadingFinances: "Завантажуємо ваші фінанси…", retry: "Спробувати ще", financeUnavailable: "Не вдалося завантажити фінанси.", openInTelegram: "Відкрийте Фінанси з Telegram-бота. Параметри браузера не можуть авторизувати цей Mini App.", general: "Загальні", language: "Мова", mainCurrency: "Основна валюта", timezone: "Часовий пояс", save: "Зберегти", saving: "Зберігаємо…", currencyHelp: "Підсумки й аналітика показуватимуться у цій валюті. Валюти рахунків не зміняться.", manageCategories: "Керувати категоріями", categoriesHelp: "Категорії допомагають зрозуміти, куди йдуть гроші.", plan: "Тариф", proActive: "Finance Pro активний.", proDescription: "Відкрийте розумні ліміти й корисні підказки з Pro.", dataPrivacy: "Дані та приватність", exportData: "Експортувати дані", onboardingTitle: "Записуйте доходи й витрати за кілька секунд", onboardingExample: "250 кава\n+3000 зарплата", onboardingCurrency: "Оберіть основну валюту", onboardingCurrencyHelp: "Її можна змінити пізніше в налаштуваннях.", onboardingChat: "Швидкі записи працюють у боті", onboardingChatHelp: "Mini App потрібен, щоб переглядати, аналізувати та редагувати фінанси.", continue: "Продовжити", finish: "Відкрити мої фінанси", expenseCategories: "Категорії витрат", incomeCategories: "Категорії доходів", addCategory: "Додати категорію", categoryName: "Назва категорії", archive: "Архівувати", noCategories: "Категорій ще немає.",
  },
  ru: {
    home: "Главная", transactions: "Операции", analytics: "Аналитика", accounts: "Счета", settings: "Настройки", categories: "Категории", overview: "Обзор", opening: "Открываем Финансы…", loadingFinances: "Загружаем ваши финансы…", retry: "Повторить", financeUnavailable: "Не удалось загрузить финансы.", openInTelegram: "Откройте Финансы из Telegram-бота. Параметры браузера не могут авторизовать этот Mini App.", general: "Общие", language: "Язык", mainCurrency: "Основная валюта", timezone: "Часовой пояс", save: "Сохранить", saving: "Сохраняем…", currencyHelp: "Итоги и аналитика будут показаны в этой валюте. Валюты счетов не изменятся.", manageCategories: "Управлять категориями", categoriesHelp: "Категории помогают понять, куда уходят деньги.", plan: "Тариф", proActive: "Finance Pro активен.", proDescription: "Откройте умные лимиты и полезные подсказки с Pro.", dataPrivacy: "Данные и приватность", exportData: "Экспортировать данные", onboardingTitle: "Записывайте доходы и расходы за несколько секунд", onboardingExample: "250 кофе\n+3000 зарплата", onboardingCurrency: "Выберите основную валюту", onboardingCurrencyHelp: "Её можно изменить позже в настройках.", onboardingChat: "Быстрые записи работают в боте", onboardingChatHelp: "Mini App нужен, чтобы смотреть, анализировать и редактировать финансы.", continue: "Продолжить", finish: "Открыть мои финансы", expenseCategories: "Категории расходов", incomeCategories: "Категории доходов", addCategory: "Добавить категорию", categoryName: "Название категории", archive: "Архивировать", noCategories: "Категорий пока нет.",
  },
};

export function normalizeFinanceLocale(value?: string | null): FinanceLocale {
  const normalized = value?.toLowerCase().split("-")[0];
  return supportedFinanceLocales.includes(normalized as FinanceLocale)
    ? (normalized as FinanceLocale)
    : "en";
}

export function financeCopy(locale?: string | null) {
  return copy[normalizeFinanceLocale(locale)];
}
