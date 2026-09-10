import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    totalBalance: "Total balance",
    incompleteBalance:
      "Some accounts are excluded because a current exchange rate is unavailable.",
    balancesByAccount: "Balances by account",
    addAccountHint: "Add an account to track balances.",
    spendingMonth: "Spending this month",
    expensesAppear: "Expenses will appear here.",
    cash: "Cash in accounts",
    savings: "Savings allocations",
    savingsPartCash:
      "Savings are already part of cash — they are not added twice.",
    investments: "Investments",
    netWorth: "Net worth",
    saved: "Saved",
    invested: "Invested",
    investmentReturns: "Investment returns",
    incompleteWorth:
      "Net worth is incomplete because some current exchange rates are unavailable.",
    recent: "Recent",
    noTransactionsYet: "No transactions yet.",
    net: "Net",
    accountFallback: "Account",
    receipt: "Receipt",
    aiEntry: "AI entry",
    manualEntry: "Manual entry",
    item: "item",
    items: "items",
  },
  uk: {
    totalBalance: "Загальний баланс",
    incompleteBalance:
      "Деякі рахунки не враховано, бо актуальний курс обміну недоступний.",
    balancesByAccount: "Баланси за рахунками",
    addAccountHint: "Додайте рахунок, щоб відстежувати баланс.",
    spendingMonth: "Витрати цього місяця",
    expensesAppear: "Витрати з’являться тут.",
    cash: "Кошти на рахунках",
    savings: "Розподілено на цілі",
    savingsPartCash:
      "Заощадження вже входять у кошти на рахунках і не додаються вдруге.",
    investments: "Інвестиції",
    netWorth: "Чистий капітал",
    saved: "Заощаджено",
    invested: "Інвестовано",
    investmentReturns: "Повернення інвестицій",
    incompleteWorth:
      "Чистий капітал неповний, бо деякі актуальні курси недоступні.",
    recent: "Останні",
    noTransactionsYet: "Операцій ще немає.",
    net: "Різниця",
    accountFallback: "Рахунок",
    receipt: "Чек",
    aiEntry: "AI-операція",
    manualEntry: "Ручна операція",
    item: "позиція",
    items: "позиції",
  },
  ru: {
    totalBalance: "Общий баланс",
    incompleteBalance:
      "Некоторые счета не учтены, потому что актуальный курс недоступен.",
    balancesByAccount: "Балансы по счетам",
    addAccountHint: "Добавьте счёт, чтобы отслеживать баланс.",
    spendingMonth: "Расходы этого месяца",
    expensesAppear: "Расходы появятся здесь.",
    cash: "Деньги на счетах",
    savings: "Распределено по целям",
    savingsPartCash:
      "Накопления уже входят в деньги на счетах и не прибавляются повторно.",
    investments: "Инвестиции",
    netWorth: "Чистый капитал",
    saved: "Накоплено",
    invested: "Инвестировано",
    investmentReturns: "Возвраты инвестиций",
    incompleteWorth:
      "Чистый капитал неполный, потому что некоторые актуальные курсы недоступны.",
    recent: "Последние",
    noTransactionsYet: "Операций пока нет.",
    net: "Разница",
    accountFallback: "Счёт",
    receipt: "Чек",
    aiEntry: "AI-операция",
    manualEntry: "Ручная операция",
    item: "позиция",
    items: "позиции",
  },
} as const;

export const financeDashboardCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
