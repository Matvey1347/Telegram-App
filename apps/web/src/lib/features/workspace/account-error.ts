import axios from "axios";
import { ACCOUNT_ERROR_KEYS } from "@telegram-system/shared";
import type { TranslationKey } from "@/i18n/catalog";
import type { TranslationValues } from "@/i18n/types";
import { isApiNetworkError } from "@/lib/api";

export function localizedAccountError(
  error: unknown,
  translate: (key: TranslationKey, values?: TranslationValues) => string,
  fallbackKey: TranslationKey,
) {
  if (isApiNetworkError(error)) return translate("account.errors.network");
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (typeof code === "string" && code in ACCOUNT_ERROR_KEYS) {
      return translate(
        ACCOUNT_ERROR_KEYS[
          code as keyof typeof ACCOUNT_ERROR_KEYS
        ] as TranslationKey,
        error.response?.data?.params,
      );
    }
  }
  return translate(fallbackKey);
}
