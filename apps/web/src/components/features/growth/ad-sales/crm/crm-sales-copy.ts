"use client";

import type { CrmSalesAttentionStatus } from "@telegram-system/shared";
import commonEn from "@/i18n/locales/en/common";
import { interpolateTranslation } from "@/i18n/types";
import { useOptionalI18n, type TranslationFunction } from "@/providers/i18n-provider";

export function useCrmSalesCopy(): TranslationFunction {
  const i18n = useOptionalI18n();
  return i18n?.t ?? ((key, values) => interpolateTranslation(commonEn[key as keyof typeof commonEn] ?? key, values));
}
export const salesStatusCopyKeys = {
  NEEDS_REPLY: "crmSales.status.needsReply", WAITING_FOR_CLIENT: "crmSales.status.waiting",
  FOLLOW_UP_DUE: "crmSales.status.followUpDue", INTERESTED: "crmSales.status.interested",
  CLOSED: "crmSales.status.closed", DO_NOT_CONTACT: "crmSales.status.doNotContact", HUMAN_REVIEW: "crmSales.status.humanReview",
} as const;
export function salesStatusLabel(status: CrmSalesAttentionStatus | null | undefined, t: TranslationFunction) {
  return status ? t(salesStatusCopyKeys[status]) : t("crmSales.status.none");
}
