import { describe, expect, it } from "vitest";
import { financeAccountsCopy } from "./accounts";
import { financeAccountCenterCopy } from "./account-center";
import { financeAnalyticsCopy } from "./analytics";
import { financeAuthCopy } from "./auth";
import { financeBudgetCopy } from "./budget";
import { financeCategoriesCopy } from "./categories";
import { financeConfirmCopy } from "./confirm";
import {
  financeCoreCopy,
  normalizeFinanceLocale,
  supportedFinanceLocales,
} from "./core";
import { financeDashboardCopy } from "./dashboard";
import { financeDebtsCopy } from "./debts";
import { financePlansCopy } from "./plans";
import { financeRemindersCopy } from "./reminders";
import { financeRegularPaymentsCopy } from "./regular-payments";
import { financeTransactionsCopy } from "./transactions";
import { financeTransfersCopy } from "./transfers";
import { financeSettingsCopy } from "./settings";
import { financeSavingsCopy } from "./savings";
import { financeInvestmentsCopy } from "./investments";

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
