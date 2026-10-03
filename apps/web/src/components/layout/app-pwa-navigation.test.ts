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
      ["calendar", "/publication-calendar"],
      ["telegram", "/telegram-posts"],
      ["ads", "/ad-campaigns"],
    ]);
    expect(
      items.find(({ key }) => key === "telegram")?.active("/telegram-bots"),
    ).toBe(true);
    expect(
      items.find(({ key }) => key === "ads")?.active("/ad-sales/crm"),
    ).toBe(false);
    expect(items.find(({ key }) => key === "ads")?.label).toBe(
      "navigation.ads",
    );
  });

  it("uses CRM when sales access is available", () => {
    const crm = buildPwaNavigation(["adSales.crm"]).find(
      ({ key }) => key === "crm",
    );
    expect(crm?.href).toBe("/ad-sales");
    expect(crm?.label).toBe("navigation.crm");
    expect(crm?.active("/ad-campaigns")).toBe(false);
  });

  it("keeps Ads visible alongside CRM and omits Settings", () => {
    const items = buildPwaNavigation([
      "dashboard",
      "finance",
      "channels",
      "adSales.crm",
      "advertising",
      "workspace",
    ]);

    expect(items.map(({ key }) => key)).toEqual([
      "finance",
      "telegram",
      "crm",
      "ads",
    ]);
    expect(
      items.find(({ key }) => key === "ads")?.active("/ad-campaigns"),
    ).toBe(true);
    expect(items.find(({ key }) => key === "workspace")).toBeUndefined();
  });
});
