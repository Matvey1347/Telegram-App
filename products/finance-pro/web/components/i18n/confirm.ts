import { financeCoreCopy, type FinanceLocale } from "./core";
const copy = {
  en: {
    confirmAction: "Confirm action",
    confirmInstruction: "Type the name below to confirm.",
    confirming: "Confirming…",
    confirmError: "Could not complete this action. Try again.",
  },
  uk: {
    confirmAction: "Підтвердження дії",
    confirmInstruction: "Введіть назву нижче для підтвердження.",
    confirming: "Підтверджуємо…",
    confirmError: "Не вдалося виконати дію. Спробуйте ще раз.",
  },
  ru: {
    confirmAction: "Подтверждение действия",
    confirmInstruction: "Введите название ниже для подтверждения.",
    confirming: "Подтверждаем…",
    confirmError: "Не удалось выполнить действие. Попробуйте ещё раз.",
  },
} as const;
export const financeConfirmCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
