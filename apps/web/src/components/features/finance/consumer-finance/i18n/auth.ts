import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    onboardingTitle: "Track income and expenses in seconds",
    onboardingExample: "250 coffee\n+3000 salary",
    onboardingCurrency: "Choose your main currency",
    onboardingCurrencyHelp: "You can change this later in Settings.",
    onboardingTimezone: "Confirm your timezone",
    onboardingAccount:
      "We create a Cash account so you can record your first transaction immediately.",
    onboardingChat: "Quick entries work in the bot",
    onboardingChatHelp:
      "Use the Mini App to view, analyse and edit your finances.",
    continue: "Continue",
    finish: "Open my finances",
    mainCurrency: "Main currency",
    signInTelegram: "Sign in with Telegram",
    signInHelp:
      "Use the Telegram account connected to your Finance bot. Your data stays the same in Telegram and the browser.",
    loadingSignIn: "Loading Telegram sign in…",
    signInUnavailable: "Telegram sign in is unavailable. Please try again later.",
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
    onboardingAccount:
      "Ми створимо рахунок «Готівка», щоб ви одразу могли додати першу операцію.",
    onboardingChat: "Швидкі записи працюють у боті",
    onboardingChatHelp:
      "Mini App потрібен, щоб переглядати, аналізувати та редагувати фінанси.",
    continue: "Продовжити",
    finish: "Відкрити мої фінанси",
    mainCurrency: "Основна валюта",
    signInTelegram: "Увійти через Telegram",
    signInHelp:
      "Використайте Telegram-акаунт, підключений до Finance-бота. Дані у Telegram і браузері будуть однаковими.",
    loadingSignIn: "Завантажуємо вхід через Telegram…",
    signInUnavailable: "Вхід через Telegram зараз недоступний. Спробуйте пізніше.",
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
    onboardingAccount:
      "Мы создадим счёт «Наличные», чтобы вы сразу могли добавить первую операцию.",
    onboardingChat: "Быстрые записи работают в боте",
    onboardingChatHelp:
      "Mini App нужен, чтобы смотреть, анализировать и редактировать финансы.",
    continue: "Продолжить",
    finish: "Открыть мои финансы",
    mainCurrency: "Основная валюта",
    signInTelegram: "Войти через Telegram",
    signInHelp:
      "Используйте Telegram-аккаунт, подключённый к Finance-боту. Данные в Telegram и браузере останутся одинаковыми.",
    loadingSignIn: "Загружаем вход через Telegram…",
    signInUnavailable: "Вход через Telegram сейчас недоступен. Попробуйте позже.",
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
