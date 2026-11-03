"use client";
import commonEn from "@/i18n/locales/en/common";
import { interpolateTranslation } from "@/i18n/types";
import { useOptionalI18n, type TranslationFunction } from "@/providers/i18n-provider";

export function useChannelReminderCopy(): TranslationFunction {
  return useOptionalI18n()?.t ?? ((key, values) => interpolateTranslation(commonEn[key as keyof typeof commonEn] ?? key, values));
}
