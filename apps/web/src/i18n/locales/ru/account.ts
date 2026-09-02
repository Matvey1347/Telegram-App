import type { TranslationCatalog } from "@/i18n/types";

const messages = {
  "account.meta.title": "Мой профиль · Nexeloq",
  "account.page.title": "Мой профиль",
  "account.page.subtitle": "Личные данные, Telegram-профиль и безопасность",
  "account.sections": "Разделы профиля",
  "account.tabs.profile": "Настройки профиля",
  "account.tabs.password": "Изменить пароль",
  "account.avatar.change": "Изменить аватар",
  "account.avatar.title": "Аватар профиля",
  "account.avatar.description": "Виден участникам рабочего пространства.",
  "account.fields.name": "Имя",
  "account.fields.email": "Email",
  "account.telegram.title": "Telegram-профиль",
  "account.telegram.description":
    "Выберите один источник профиля для рабочих процессов.",
  "account.telegram.usernameMode": "Имя пользователя",
  "account.telegram.accountMode": "Подключённый аккаунт",
  "account.telegram.username": "Имя пользователя Telegram",
  "account.telegram.usernameHelp":
    "Используется, если подключённый аккаунт не назначен.",
  "account.telegram.account": "Аккаунт Telegram",
  "account.telegram.loadingAccounts": "Загрузка аккаунтов…",
  "account.telegram.selectAccount": "Выберите подключённый аккаунт",
  "account.telegram.selectPrompt":
    "Выберите аккаунт, который будет отображаться в вашем профиле.",
  "account.telegram.noneAvailable":
    "Нет доступных подключённых аккаунтов Telegram.",
  "account.telegram.connected": "Подключён",
  "account.actions.save": "Сохранить изменения",
  "account.actions.saving": "Сохранение…",
  "account.actions.retry": "Повторить",
  "account.password.title": "Изменить пароль",
  "account.password.description":
    "Используйте не менее 8 символов и не повторяйте текущий пароль.",
  "account.password.current": "Текущий пароль",
  "account.password.new": "Новый пароль",
  "account.password.confirm": "Подтвердите новый пароль",
  "account.password.show": "Показать пароль",
  "account.password.hide": "Скрыть пароль",
  "account.password.update": "Обновить пароль",
  "account.password.updating": "Обновление…",
  "account.validation.required": "Обязательное поле",
  "account.validation.passwordMin": "Используйте не менее 8 символов",
  "account.validation.passwordMismatch":
    "Подтверждение нового пароля не совпадает",
  "account.errors.network":
    "Не удалось подключиться к серверу. Повторите попытку позже.",
  "account.errors.loadProfile": "Не удалось загрузить профиль.",
  "account.errors.loadTelegramAccounts":
    "Не удалось загрузить подключённые аккаунты Telegram.",
  "account.errors.updateProfile": "Не удалось обновить профиль.",
  "account.errors.updatePassword": "Не удалось обновить пароль.",
  "account.errors.nameEmpty": "Имя не может быть пустым.",
  "account.errors.emailAlreadyExists": "Аккаунт с таким email уже существует.",
  "account.errors.avatarNotFound": "Выбранный аватар не найден.",
  "account.errors.telegramUsernameAssigned":
    "Это имя пользователя Telegram уже назначено другому участнику.",
  "account.errors.telegramAccountsNotFound":
    "Один или несколько аккаунтов Telegram не найдены в этом рабочем пространстве.",
  "account.errors.telegramAccountsAssigned":
    "Один или несколько аккаунтов Telegram уже связаны с другим участником.",
  "account.errors.currentPasswordIncorrect": "Текущий пароль указан неверно.",
} as const satisfies TranslationCatalog;

export default messages;
