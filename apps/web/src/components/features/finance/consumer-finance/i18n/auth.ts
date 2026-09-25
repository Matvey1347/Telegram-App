import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    onboardingTitle: "Track income and expenses in seconds",
    onboardingExample: "250 coffee\n+3000 salary",
    onboardingCurrency: "Choose your main currency",
    onboardingCurrencyHelp: "You can change this later in Settings.",
    onboardingTimezone: "Confirm your timezone",
    onboardingAccount: "Accounts are created only when you are ready.",
    onboardingChat: "A short tour of Finance",
    onboardingChatHelp:
      "See where to add an account, record operations and check your progress.",
    onboardingOverview:
      "Overview keeps your balances and monthly result in one place.",
    onboardingAccounts:
      "Add only the cash, cards or savings accounts you want to track.",
    onboardingTransactions:
      "Use the plus button or the bot to record income and expenses.",
    onboardingAnalytics:
      "Analytics helps you understand spending patterns once you have activity.",
    onboardingSkip: "Skip tour",
    onboardingNext: "Next",
    tourOverview:
      "Overview shows your balances and result for the selected period.",
    tourTransactions:
      "Use the plus button for income and expenses; transaction history keeps every entry together.",
    tourAnalytics:
      "Analytics turns your activity into spending and income patterns.",
    tourDetails: "Want a detailed tour of accounts, categories and transfers?",
    tourDetailed: "Show detailed tour",
    tourFinish: "Finish tour",
    tourAccounts:
      "Accounts hold your cash, cards and savings. Add only what you track.",
    tourCategories: "Categories make expense and income analytics useful.",
    tourTransfers:
      "Transfers move money between your accounts and are not income or expense.",
    tourJarvis:
      "Jarvis understands natural-language requests, prepares a reviewable proposal, and never writes an operation without your confirmation.",
    continue: "Continue",
    finish: "Open my finances",
    mainCurrency: "Main currency",
    signInTelegram: "Sign in with Telegram",
    signInHelp:
      "Use the Telegram account connected to your Finance bot. Your data stays the same in Telegram and the browser.",
    loadingSignIn: "Loading Telegram sign in…",
    signInUnavailable:
      "Telegram sign in is unavailable. Please try again later.",
    telegramSignIn: "Telegram sign in",
    telegramSignInWaiting:
      "In Telegram, press Start in the Finance bot. This page will open automatically.",
    telegramSignInExpired:
      "The login request expired. Create a new request and try again.",
  },
  uk: {
    onboardingTitle: "Записуйте доходи й витрати за кілька секунд",
    onboardingExample: "250 кава\n+3000 зарплата",
    onboardingCurrency: "Оберіть основну валюту",
    onboardingCurrencyHelp: "Її можна змінити пізніше в налаштуваннях.",
    onboardingTimezone: "Підтвердьте свій часовий пояс",
    onboardingAccount: "Рахунки створюєте лише ви — коли будете готові.",
    onboardingChat: "Короткий тур Finance",
    onboardingChatHelp:
      "Дізнайтеся, де додавати рахунки, записувати операції та переглядати результат.",
    onboardingOverview: "В огляді зібрані баланси та результат за місяць.",
    onboardingAccounts:
      "Додайте лише готівку, картки або заощадження, які хочете відстежувати.",
    onboardingTransactions:
      "Додавайте доходи й витрати через кнопку плюс або в боті.",
    onboardingAnalytics:
      "Аналітика покаже структуру витрат, щойно з’являться операції.",
    onboardingSkip: "Пропустити тур",
    onboardingNext: "Далі",
    tourOverview: "Огляд показує баланси та результат за вибраний період.",
    tourTransactions:
      "Через плюс додавайте доходи й витрати; історія зберігає всі операції.",
    tourAnalytics:
      "Аналітика перетворює операції на зрозумілу картину доходів і витрат.",
    tourDetails: "Показати детальний тур рахунками, категоріями та переказами?",
    tourDetailed: "Детальний тур",
    tourFinish: "Завершити тур",
    tourAccounts:
      "Рахунки — це готівка, картки й заощадження, які ви хочете відстежувати.",
    tourCategories: "Категорії роблять аналітику доходів і витрат корисною.",
    tourTransfers:
      "Перекази переміщують гроші між вашими рахунками, це не дохід і не витрата.",
    tourJarvis:
      "Джаврис розуміє запити природною мовою, готує пропозицію для перегляду й ніколи не записує операцію без вашого підтвердження.",
    continue: "Продовжити",
    finish: "Відкрити мої фінанси",
    mainCurrency: "Основна валюта",
    signInTelegram: "Увійти через Telegram",
    signInHelp:
      "Використайте Telegram-акаунт, підключений до Finance-бота. Дані у Telegram і браузері будуть однаковими.",
    loadingSignIn: "Завантажуємо вхід через Telegram…",
    signInUnavailable:
      "Вхід через Telegram зараз недоступний. Спробуйте пізніше.",
    telegramSignIn: "Вхід через Telegram",
    telegramSignInWaiting:
      "У Telegram натисніть Start у Finance-боті. Ця сторінка відкриється автоматично.",
    telegramSignInExpired:
      "Термін дії запиту минув. Створіть новий запит і спробуйте ще раз.",
  },
  ru: {
    onboardingTitle: "Записывайте доходы и расходы за несколько секунд",
    onboardingExample: "250 кофе\n+3000 зарплата",
    onboardingCurrency: "Выберите основную валюту",
    onboardingCurrencyHelp: "Её можно изменить позже в настройках.",
    onboardingTimezone: "Подтвердите свой часовой пояс",
    onboardingAccount: "Счета создаёте только вы — когда будете готовы.",
    onboardingChat: "Короткий тур по Finance",
    onboardingChatHelp:
      "Узнайте, где добавлять счета, записывать операции и смотреть результат.",
    onboardingOverview: "В обзоре собраны балансы и результат за месяц.",
    onboardingAccounts:
      "Добавьте только наличные, карты или накопления, которые хотите отслеживать.",
    onboardingTransactions:
      "Добавляйте доходы и расходы кнопкой плюс или в боте.",
    onboardingAnalytics:
      "Аналитика покажет структуру трат, когда появятся операции.",
    onboardingSkip: "Пропустить тур",
    onboardingNext: "Далее",
    tourOverview: "Обзор показывает балансы и результат за выбранный период.",
    tourTransactions:
      "Через плюс добавляйте доходы и расходы; история хранит все операции.",
    tourAnalytics:
      "Аналитика превращает операции в понятную картину доходов и расходов.",
    tourDetails: "Показать подробный тур по счетам, категориям и переводам?",
    tourDetailed: "Подробный тур",
    tourFinish: "Завершить тур",
    tourAccounts:
      "Счета — это наличные, карты и накопления, которые вы хотите отслеживать.",
    tourCategories: "Категории делают аналитику доходов и расходов полезной.",
    tourTransfers:
      "Переводы перемещают деньги между вашими счетами, это не доход и не расход.",
    tourJarvis:
      "Джарвис понимает запросы на обычном языке, готовит предложение для проверки и никогда не записывает операцию без вашего подтверждения.",
    continue: "Продолжить",
    finish: "Открыть мои финансы",
    mainCurrency: "Основная валюта",
    signInTelegram: "Войти через Telegram",
    signInHelp:
      "Используйте Telegram-аккаунт, подключённый к Finance-боту. Данные в Telegram и браузере останутся одинаковыми.",
    loadingSignIn: "Загружаем вход через Telegram…",
    signInUnavailable:
      "Вход через Telegram сейчас недоступен. Попробуйте позже.",
    telegramSignIn: "Вход через Telegram",
    telegramSignInWaiting:
      "В Telegram нажмите Start в Finance-боте. Эта страница откроется автоматически.",
    telegramSignInExpired:
      "Срок действия запроса истёк. Создайте новый запрос и попробуйте снова.",
  },
} as const;
export const financeAuthCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
