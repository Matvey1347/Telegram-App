import { describe, expect, it } from "vitest";
import { financeAccountsCopy } from "@finance-pro/web/components/i18n/accounts";
import { financeAccountCenterCopy } from "@finance-pro/web/components/i18n/account-center";
import { financeAnalyticsCopy } from "@finance-pro/web/components/i18n/analytics";
import { financeAuthCopy } from "@finance-pro/web/components/i18n/auth";
import { financeBudgetCopy } from "@finance-pro/web/components/i18n/budget";
import { financeCategoriesCopy } from "@finance-pro/web/components/i18n/categories";
import { financeConfirmCopy } from "@finance-pro/web/components/i18n/confirm";
import {
  financeCoreCopy,
  normalizeFinanceLocale,
  supportedFinanceLocales,
} from "@finance-pro/web/components/i18n/core";
import { financeDashboardCopy } from "@finance-pro/web/components/i18n/dashboard";
import { financeDebtsCopy } from "@finance-pro/web/components/i18n/debts";
import { financePlansCopy } from "@finance-pro/web/components/i18n/plans";
import { financeRemindersCopy } from "@finance-pro/web/components/i18n/reminders";
import { financeRegularPaymentsCopy } from "@finance-pro/web/components/i18n/regular-payments";
import { financeTransactionsCopy } from "@finance-pro/web/components/i18n/transactions";
import { financeTransfersCopy } from "@finance-pro/web/components/i18n/transfers";
import { financeSettingsCopy } from "@finance-pro/web/components/i18n/settings";
import { financeSavingsCopy } from "@finance-pro/web/components/i18n/savings";
import { financeInvestmentsCopy } from "@finance-pro/web/components/i18n/investments";

const namespaces = {
  core: financeCoreCopy,
  accountCenter: financeAccountCenterCopy,
  accounts: financeAccountsCopy,
  analytics: financeAnalyticsCopy,
  auth: financeAuthCopy,
  budget: financeBudgetCopy,
  categories: financeCategoriesCopy,
  confirm: financeConfirmCopy,
  dashboard: financeDashboardCopy,
  debts: financeDebtsCopy,
  plans: financePlansCopy,
  reminders: financeRemindersCopy,
  regularPayments: financeRegularPaymentsCopy,
  settings: financeSettingsCopy,
  transactions: financeTransactionsCopy,
  transfers: financeTransfersCopy,
  savings: financeSavingsCopy,
  investments: financeInvestmentsCopy,
};

function translationLeaves(
  value: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string"
      ? [[path, child]]
      : child && typeof child === "object" && !Array.isArray(child)
        ? translationLeaves(child as Record<string, unknown>, path)
        : [[path, ""]];
  });
}

describe("Consumer Finance feature-local i18n", () => {
  it.each(Object.entries(namespaces))(
    "%s has non-empty key parity for en, uk and ru",
    (_, getCopy) => {
      const englishKeys = translationLeaves(getCopy("en")).map(([key]) => key);
      for (const locale of supportedFinanceLocales) {
        const localized = translationLeaves(getCopy(locale));
        expect(localized.map(([key]) => key)).toEqual(englishKeys);
        expect(localized.every(([, value]) => value.trim())).toBe(true);
      }
    },
  );

  it("normalizes regional and unknown locale values deterministically", () => {
    expect(normalizeFinanceLocale("uk-UA")).toBe("uk");
    expect(normalizeFinanceLocale("ru-RU")).toBe("ru");
    expect(normalizeFinanceLocale("pl-PL")).toBe("en");
  });
});
