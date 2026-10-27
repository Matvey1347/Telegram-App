import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";

const copy = {
  en: {
    landingNavLabel: "Page navigation",
    landingNavFeatures: "Features",
    landingNavHow: "How it works",
    landingNavQuestions: "Questions",
    landingCta: "Sign in or sign up",
    landingExplore: "Explore Groshly",
    landingNoInstall: "No new app to install",
    landingSignal: "Everything important about your money, together",
    landingTransactions: "Transactions",
    previewLabel: "Groshly finance dashboard",
    previewTag: "PREVIEW",
    previewGreeting: "Your money at a glance",
    previewBalance: "TOTAL BALANCE",
    previewBalanceNote: "Across your accounts",
    previewIncome: "Income",
    previewExpense: "Spending",
    previewActivity: "Recent activity",
    previewThisMonth: "This month",
    previewCoffee: "Coffee",
    previewSalary: "Salary",
    previewToday: "Today",
    previewYesterday: "Yesterday",
    previewNote: "An example of your future dashboard",
    landingFeaturesTitle: "A clearer picture of your money.",
    landingFeaturesLead:
      "Simple enough for everyday use. Detailed enough when you want to understand what changed.",
    landingFeatureAccountsTitle: "All accounts in one view",
    landingFeatureAccountsBody:
      "See balances across your accounts and keep transfers separate from income and spending.",
    landingFeatureTransactionsTitle: "Record the moment",
    landingFeatureTransactionsBody:
      "Add income and expenses as they happen. Find past operations without digging through notes.",
    landingFeatureDebtsTitle: "Remember who owes what",
    landingFeatureDebtsBody:
      "Track money you lent or borrowed, repayments and dates. Keep a debt separate from an account movement when needed.",
    landingFeatureAnalyticsTitle: "See the patterns",
    landingFeatureAnalyticsBody:
      "Understand where money comes from and goes, with categories and clear period views.",
    landingShowcaseKicker: "A useful overview",
    landingShowcaseTitle: "Numbers that make sense, without the spreadsheet.",
    landingShowcaseBody:
      "Your accounts, activity and spending come together in one calm workspace. Open details when you need them; the big picture is always close.",
    landingShowcaseCardTitle: "Spending by category",
    landingShowcaseCardBody: "Know what shaped your month",
    landingShowcaseFloating: "A clearer month, one entry at a time",
    landingHowTitle: "Start with what you already use.",
    landingHowLead:
      "Your Telegram account is the key. Your financial view stays available in the browser and Mini App.",
    landingStepOneTitle: "Enter through Telegram",
    landingStepOneBody:
      "Confirm the sign-in request in Telegram. New here? The same step creates your account.",
    landingStepTwoTitle: "Add your first account",
    landingStepTwoBody:
      "Set the currency and starting balance, then record your first income or expense.",
    landingStepThreeTitle: "Follow your progress",
    landingStepThreeBody:
      "Return for balances, activity, debts and insights as your picture grows.",
    landingSecurityKicker: "Your data is yours",
    landingSecurityTitle: "A familiar sign-in, with server-side verification.",
    landingFaqTitle: "Good to know before you begin",
    landingFaqOneQ: "Do I need a separate password?",
    landingFaqOneA:
      "No. Telegram confirms the sign-in request; Groshly verifies it on the server.",
    landingFaqTwoQ: "Can I use Groshly in a browser and Telegram?",
    landingFaqTwoA:
      "Yes. Both open the same Finance profile, so you can continue on either surface.",
    landingFaqThreeQ: "What if I am new to tracking money?",
    landingFaqThreeA:
      "Begin with one account and one entry. Groshly guides you through the screens as you go.",
    landingStartKicker: "Ready when you are",
    landingStartTitle: "Make room for a clearer money picture.",
    landingStartBody:
      "Sign in or create your account through Telegram. Your first step takes just a moment.",
    landingFooter: "Your money, clearly.",
    landingBackTop: "Back to top",
    landingPrivacy: "Privacy Policy",
    landingTerms: "Terms & Conditions",
  },
  uk: {
    landingNavLabel: "Навігація сторінкою",
    landingNavFeatures: "Можливості",
    landingNavHow: "Як це працює",
    landingNavQuestions: "Питання",
    landingCta: "Увійти або зареєструватися",
    landingExplore: "Дізнатися більше",
    landingNoInstall: "Не потрібно встановлювати застосунок",
    landingSignal: "Усе важливе про ваші гроші — разом",
    landingTransactions: "Операції",
    previewLabel: "Фінансовий екран Groshly",
    previewTag: "ПРИКЛАД",
    previewGreeting: "Ваші гроші з першого погляду",
    previewBalance: "ЗАГАЛЬНИЙ БАЛАНС",
    previewBalanceNote: "На ваших рахунках",
    previewIncome: "Доходи",
    previewExpense: "Витрати",
    previewActivity: "Останні операції",
    previewThisMonth: "Цей місяць",
    previewCoffee: "Кава",
    previewSalary: "Зарплата",
    previewToday: "Сьогодні",
    previewYesterday: "Учора",
    previewNote: "Приклад вашого майбутнього огляду",
    landingFeaturesTitle: "Зрозуміла картина ваших фінансів.",
    landingFeaturesLead:
      "Просто для щоденних записів. Достатньо деталей, коли хочеться зрозуміти зміни.",
    landingFeatureAccountsTitle: "Усі рахунки разом",
    landingFeatureAccountsBody:
      "Дивіться баланси рахунків і відокремлюйте перекази від доходів та витрат.",
    landingFeatureTransactionsTitle: "Записуйте одразу",
    landingFeatureTransactionsBody:
      "Додавайте доходи й витрати, коли вони трапляються. Знаходьте минулі операції без нотаток.",
    landingFeatureDebtsTitle: "Пам’ятайте про борги",
    landingFeatureDebtsBody:
      "Відстежуйте, хто кому винен, повернення та дати. За потреби не прив’язуйте борг до руху грошей на рахунку.",
    landingFeatureAnalyticsTitle: "Помічайте закономірності",
    landingFeatureAnalyticsBody:
      "Розумійте, звідки приходять і куди йдуть гроші, за категоріями та періодами.",
    landingShowcaseKicker: "Корисний огляд",
    landingShowcaseTitle: "Зрозумілі цифри без електронних таблиць.",
    landingShowcaseBody:
      "Рахунки, операції та витрати зібрані в одному спокійному просторі. Деталі поруч, коли вони потрібні.",
    landingShowcaseCardTitle: "Витрати за категоріями",
    landingShowcaseCardBody: "Дізнайтеся, яким був ваш місяць",
    landingShowcaseFloating: "Ясніший місяць, запис за записом",
    landingHowTitle: "Почніть із того, чим уже користуєтеся.",
    landingHowLead:
      "Ваш акаунт Telegram — ключ до входу. Фінанси доступні у браузері та Mini App.",
    landingStepOneTitle: "Увійдіть через Telegram",
    landingStepOneBody:
      "Підтвердьте запит у Telegram. Якщо ви вперше тут, цей самий крок створить акаунт.",
    landingStepTwoTitle: "Додайте перший рахунок",
    landingStepTwoBody:
      "Оберіть валюту й початковий баланс, а потім запишіть перший дохід чи витрату.",
    landingStepThreeTitle: "Стежте за змінами",
    landingStepThreeBody:
      "Повертайтеся до балансів, операцій, боргів та аналітики, коли даних побільшає.",
    landingSecurityKicker: "Ваші дані належать вам",
    landingSecurityTitle: "Звичний вхід із перевіркою на сервері.",
    landingFaqTitle: "Варто знати перед початком",
    landingFaqOneQ: "Чи потрібен окремий пароль?",
    landingFaqOneA:
      "Ні. Telegram підтверджує запит на вхід, а Groshly перевіряє його на сервері.",
    landingFaqTwoQ: "Можна користуватися у браузері й Telegram?",
    landingFaqTwoA:
      "Так. Обидва способи відкривають той самий фінансовий профіль.",
    landingFaqThreeQ: "А якщо я раніше не вів облік?",
    landingFaqThreeA:
      "Почніть з одного рахунку й одного запису. Groshly допоможе освоїти екрани.",
    landingStartKicker: "Можна починати",
    landingStartTitle: "Побачте свої гроші ясніше.",
    landingStartBody:
      "Увійдіть або створіть акаунт через Telegram. Перший крок займе лише мить.",
    landingFooter: "Ваші гроші — зрозуміло.",
    landingBackTop: "Нагору",
    landingPrivacy: "Політика конфіденційності",
    landingTerms: "Умови використання",
  },

} as const;

export function financeLandingCopy(locale: FinanceLocale) {
  return { ...financeAuthCopy(locale), ...copy[locale === "en" ? "en" : "uk"] };
}
