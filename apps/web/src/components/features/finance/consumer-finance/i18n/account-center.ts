import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    profile: "Profile",
    currentPlan: "Current plan",
    currentPlanHelp: "Your active plan and included Finance access.",
    displayName: "Display name",
    financeAvatar: "Finance avatar",
    changeAvatar: "Upload avatar",
    uploadingAvatar: "Uploading avatar…",
    resettingAvatar: "Resetting avatar…",
    avatarError: "Could not update the avatar. Use a JPEG, PNG or WebP image up to 2 MB.",
    useTelegramAvatar: "Use Telegram avatar",
    telegramAccount: "Telegram account",
    identityHelp:
      "Upload a Finance-only image or use the Telegram avatar. Your Telegram username is never changed. The display name is used only in Finance.",
    saveProfile: "Save profile",
    profileSaved: "Profile saved",
    profileError: "Could not save the profile.",
  },
  uk: {
    profile: "Профіль",
    currentPlan: "Поточний тариф",
    currentPlanHelp: "Ваш активний тариф і доступні можливості Finance.",
    displayName: "Ім’я для відображення",
    financeAvatar: "Аватар Finance",
    changeAvatar: "Завантажити аватар",
    uploadingAvatar: "Завантаження аватара…",
    resettingAvatar: "Скидання аватара…",
    avatarError: "Не вдалося оновити аватар. Використайте JPEG, PNG або WebP до 2 МБ.",
    useTelegramAvatar: "Використовувати аватар Telegram",
    telegramAccount: "Акаунт Telegram",
    identityHelp:
      "Завантажте зображення лише для Finance або використовуйте аватар Telegram. Username Telegram не змінюється. Ім’я для відображення використовується лише у Finance.",
    saveProfile: "Зберегти профіль",
    profileSaved: "Профіль збережено",
    profileError: "Не вдалося зберегти профіль.",
  },
  ru: {
    profile: "Профиль",
    currentPlan: "Текущий тариф",
    currentPlanHelp: "Ваш активный тариф и доступные возможности Finance.",
    displayName: "Отображаемое имя",
    financeAvatar: "Аватар Finance",
    changeAvatar: "Загрузить аватар",
    uploadingAvatar: "Загрузка аватара…",
    resettingAvatar: "Сброс аватара…",
    avatarError: "Не удалось обновить аватар. Используйте JPEG, PNG или WebP до 2 МБ.",
    useTelegramAvatar: "Использовать аватар Telegram",
    telegramAccount: "Аккаунт Telegram",
    identityHelp:
      "Загрузите изображение только для Finance или используйте аватар Telegram. Username Telegram не изменяется. Отображаемое имя используется только в Finance.",
    saveProfile: "Сохранить профиль",
    profileSaved: "Профиль сохранён",
    profileError: "Не удалось сохранить профиль.",
  },
} as const;

export const financeAccountCenterCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
