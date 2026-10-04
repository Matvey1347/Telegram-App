import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const source = (file: string) => readFileSync(join(root, file), "utf8");

describe("Consumer Finance initial module graph", () => {
  it("keeps heavy screens behind module-scope lazy imports", () => {
    const host = source("consumer-finance-screens.tsx");
    const heavy = [
      "accounts/finance-accounts",
      "accounts/finance-account-editor",
      "accounts/finance-account-center",
      "analytics/finance-analytics",
      "planning/finance-budget",
      "catalog/finance-categories",
      "onboarding/finance-onboarding",
      "planning/finance-plans",
      "planning/finance-reminders",
      "profile/finance-settings",
      "ledger/finance-transactions",
      "ledger/finance-transfers",
      "obligations/finance-debts",
      "obligations/finance-regular-payments",
      "savings/finance-savings",
      "investments/finance-investments",
      "investments/finance-investment-detail",
    ];
    for (const modulePath of heavy) {
      const moduleName = `@finance-pro/web/components/${modulePath}`;
      expect(host).toContain(`import("${moduleName}")`);
      expect(host).not.toMatch(new RegExp(`from ["']${moduleName}["']`));
    }
    expect(host).not.toContain("consumer-finance-api");
    expect(host).not.toContain("consumer-finance-ledger-api");
    expect(host).not.toContain("consumer-finance-planning-api");
  });

  it("keeps the eager app on the narrow profile capability", () => {
    const app = source("consumer-finance-app.tsx");

    expect(app).toContain("consumer-finance-profile-api");
    expect(app).not.toContain("consumer-finance-planning-api");
  });

  it("keeps hidden-screen copy out of Home and synchronous core", () => {
    const initialCopy = `${source("../dashboard/finance-dashboard.tsx")}\n${source(
      "../i18n/dashboard.ts",
    )}\n${source("../i18n/core.ts")}`;
    expect(initialCopy).not.toContain("Current plan");
    expect(initialCopy).not.toContain("Reminder name");
    expect(initialCopy).not.toContain("Category name");
    expect(initialCopy).not.toContain("Cashflow timeline");
    expect(initialCopy).not.toContain("Person or debt name");
    expect(initialCopy).not.toContain("Use this amount for future payments");
  });

  it("keeps the account editor chunk independent from the list screen", () => {
    expect(source("../accounts/finance-account-editor.tsx")).not.toContain(
      'from "@finance-pro/web/components/accounts/finance-accounts"',
    );
  });

  it("removes the legacy monolithic translation modules", () => {
    expect(existsSync(join(root, "finance-i18n.ts"))).toBe(false);
    expect(existsSync(join(root, "finance-i18n-ru.ts"))).toBe(false);
  });
});
