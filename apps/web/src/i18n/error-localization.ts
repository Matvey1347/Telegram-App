import axios from "axios";
import type { AppLocale } from "@/i18n/types";
import type { TranslationValues } from "@/i18n/types";
import type { TranslationKey } from "@/i18n/catalog";
import { TELEGRAM_POSTS_ERROR_KEYS } from "@telegram-system/shared";

export function localizedApiErrorKey(error: unknown): TranslationKey {
  if (!axios.isAxiosError(error)) return "common.error.generic";
  if (!error.response) return "common.error.network";
  const code = error.response.data?.code;
  return typeof code === "string" && code in TELEGRAM_POSTS_ERROR_KEYS
    ? (TELEGRAM_POSTS_ERROR_KEYS[
        code as keyof typeof TELEGRAM_POSTS_ERROR_KEYS
      ] as TranslationKey)
    : "telegram.posts.error.generic";
}

export function safeApiErrorMessage(
  error: unknown,
  locale: AppLocale,
  translate: (key: TranslationKey, values?: TranslationValues) => string,
  englishFallback: string,
) {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (typeof code === "string" && code in TELEGRAM_POSTS_ERROR_KEYS) {
      const params = error.response?.data?.params;
      return translate(
        TELEGRAM_POSTS_ERROR_KEYS[
          code as keyof typeof TELEGRAM_POSTS_ERROR_KEYS
        ] as TranslationKey,
        params && typeof params === "object" ? params : undefined,
      );
    }
  }
  if (locale === "en") {
    const raw = axios.isAxiosError(error) ? error.response?.data?.message : null;
    return typeof raw === "string" && raw.trim() ? raw : englishFallback;
  }
  return translate(localizedApiErrorKey(error));
}
