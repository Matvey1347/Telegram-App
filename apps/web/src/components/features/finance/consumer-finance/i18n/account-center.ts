import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    profile: "Profile",
    displayName: "Display name",
    telegramAccount: "Telegram account",
    identityHelp:
      "Your avatar and Telegram username stay synchronized with Telegram. The display name is used only in Finance.",
    saveProfile: "Save profile",
    profileSaved: "Profile saved",
    profileError: "Could not save the profile.",
  },
  uk: {
    profile: "Профіль",
    displayName: "Ім’я для відображення",
    telegramAccount: "Акаунт Telegram",
    identityHelp:
      "Аватар і username синхронізуються з Telegram. Ім’я для відображення використовується лише у Finance.",
    saveProfile: "Зберегти профіль",
    profileSaved: "Профіль збережено",
    profileError: "Не вдалося зберегти профіль.",
  },
  ru: {
    profile: "Профиль",
    displayName: "Отображаемое имя",
    telegramAccount: "Аккаунт Telegram",
    identityHelp:
      "Аватар и username синхронизируются с Telegram. Отображаемое имя используется только в Finance.",
    saveProfile: "Сохранить профиль",
    profileSaved: "Профиль сохранён",
    profileError: "Не удалось сохранить профиль.",
  },
} as const;

export const financeAccountCenterCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});
