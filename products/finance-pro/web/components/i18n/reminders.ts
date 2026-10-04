import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    remindersHelp:
      "Get a monthly Telegram alert before an expected payment or income. A reminder never creates a transaction.",
    reminderName: "Reminder name",
    reminderAmount: "Expected amount",
    reminderAmountHelp:
      "Used in forecasts and shown in the alert; money is not added or deducted automatically.",
    reminderDay: "Day of month",
    reminderOffset: "Minutes before",
    addReminder: "Add reminder",
    noReminders: "No reminders yet.",
    reminderSaveError: "Could not create the reminder.",
    reminderLoadError: "Could not load reminders.",
    nextReminder: "Next reminder",
  },
  uk: {
    remindersHelp:
      "Отримуйте щомісячне нагадування в Telegram перед очікуваним платежем або доходом. Нагадування не створює операцію.",
    reminderName: "Назва нагадування",
    reminderAmount: "Очікувана сума",
    reminderAmountHelp:
      "Використовується у прогнозі та показується в нагадуванні; гроші не списуються й не додаються автоматично.",
    reminderDay: "День місяця",
    reminderOffset: "Хвилин до події",
    addReminder: "Додати нагадування",
    noReminders: "Нагадувань ще немає.",
    reminderSaveError: "Не вдалося створити нагадування.",
    reminderLoadError: "Не вдалося завантажити нагадування.",
    nextReminder: "Наступне нагадування",
  },
  ru: {
    remindersHelp:
      "Получайте ежемесячное сообщение в Telegram перед ожидаемым платежом или доходом. Напоминание не создаёт операцию.",
    reminderName: "Название напоминания",
    reminderAmount: "Ожидаемая сумма",
    reminderAmountHelp:
      "Используется в прогнозе и показывается в напоминании; деньги не списываются и не добавляются автоматически.",
    reminderDay: "День месяца",
    reminderOffset: "Минут до события",
    addReminder: "Добавить напоминание",
    noReminders: "Напоминаний пока нет.",
    reminderSaveError: "Не удалось создать напоминание.",
    reminderLoadError: "Не удалось загрузить напоминания.",
    nextReminder: "Следующее напоминание",
  },
} as const;
export const financeRemindersCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
