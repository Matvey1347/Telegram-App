import { describe, expect, it } from "vitest";
import { buildPwaNavigation } from "./app-pwa-navigation";

describe("installed Nexeloq navigation", () => {
  it("builds compact domain destinations from workspace access", () => {
    const items = buildPwaNavigation([
      "dashboard",
      "posts",
      "advertising",
      "workspace",
    ]);

    expect(items.map(({ key, href }) => [key, href])).toEqual([
      ["overview", "/"],
      ["telegram", "/telegram-posts"],
      ["growth", "/ad-campaigns"],
      ["workspace", "/settings"],
    ]);
    expect(
      items.find(({ key }) => key === "telegram")?.active("/telegram-bots"),
    ).toBe(true);
    expect(
      items.find(({ key }) => key === "growth")?.active("/ad-sales/crm"),
    ).toBe(false);
    expect(items.find(({ key }) => key === "growth")?.label).toBe(
      "navigation.ads",
    );
  });

  it("uses the CRM destination when CRM access is available", () => {
    const growth = buildPwaNavigation(["adSales.crm"]).find(
      ({ key }) => key === "growth",
    );
    expect(growth?.href).toBe("/ad-sales");
    expect(growth?.label).toBe("navigation.crm");
    expect(growth?.active("/ad-campaigns")).toBe(false);
  });
});
