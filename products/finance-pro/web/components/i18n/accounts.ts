import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    addAccount: "Add account",
    accountName: "Account name",
    accountType: "Account type",
    currency: "Currency",
    openingBalance: "Opening balance",
    cash: "Cash",
    card: "Card",
    savings: "Savings",
    other: "Other",
    archiveAccount: "Archive account",
    archiveAccountDescription:
      "Historical transactions and transfers will keep this account.",
    noAccounts: "Create your first account.",
    archivedAccounts: "Archived accounts",
    archivedAccountsHelp:
      "Archived accounts stay visible in historical transactions and cannot receive new entries.",
    accountSaveError: "Could not save the account. Check the fields and try again.",
    accountArchiveError: "Could not archive the account.",
  },
  uk: {
    addAccount: "Додати рахунок",
    accountName: "Назва рахунку",
    accountType: "Тип рахунку",
    currency: "Валюта",
    openingBalance: "Початковий баланс",
    cash: "Готівка",
    card: "Картка",
    savings: "Заощадження",
    other: "Інше",
    archiveAccount: "Архівувати рахунок",
    archiveAccountDescription:
      "Історичні операції та перекази збережуть цей рахунок.",
    noAccounts: "Створіть свій перший рахунок.",
    archivedAccounts: "Архівні рахунки",
    archivedAccountsHelp:
      "Архівні рахунки залишаються в історії, але нові операції для них недоступні.",
    accountSaveError: "Не вдалося зберегти рахунок. Перевірте поля.",
    accountArchiveError: "Не вдалося архівувати рахунок.",
  },
  ru: {
    addAccount: "Добавить счёт",
    accountName: "Название счёта",
    accountType: "Тип счёта",
    currency: "Валюта",
    openingBalance: "Начальный баланс",
    cash: "Наличные",
    card: "Карта",
    savings: "Сбережения",
    other: "Другое",
    archiveAccount: "Архивировать счёт",
    archiveAccountDescription:
      "Исторические операции и переводы сохранят этот счёт.",
    noAccounts: "Создайте свой первый счёт.",
    archivedAccounts: "Архивные счета",
    archivedAccountsHelp:
      "Архивные счета остаются в истории, но новые операции для них недоступны.",
    accountSaveError: "Не удалось сохранить счёт. Проверьте поля.",
    accountArchiveError: "Не удалось архивировать счёт.",
  },
} as const;

export const financeAccountsCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
