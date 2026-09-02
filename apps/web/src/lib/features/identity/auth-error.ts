import axios from "axios";
import { AUTH_ERROR_KEYS } from "@telegram-system/shared";
import type { TranslationKey } from "@/i18n/catalog";
import type { TranslationValues } from "@/i18n/types";
import { isApiNetworkError } from "@/lib/api";

export function localizedAuthError(
  error: unknown,
  translate: (key: TranslationKey, values?: TranslationValues) => string,
  fallbackKey: TranslationKey,
) {
  if (isApiNetworkError(error)) return translate("auth.errors.network");
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (typeof code === "string" && code in AUTH_ERROR_KEYS) {
      return translate(
        AUTH_ERROR_KEYS[code as keyof typeof AUTH_ERROR_KEYS] as TranslationKey,
        error.response?.data?.params,
      );
    }
    if (error.response?.status === 401) return translate("auth.errors.invalidCredentials");
    if (error.response?.status === 409) return translate("auth.errors.emailAlreadyExists");
    if (error.response?.status === 429) return translate("auth.errors.tooManyAttempts");
  }
  return translate(fallbackKey);
}
