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

  it("uses Selling as the first destination when sales access is available", () => {
    const selling = buildPwaNavigation(["adSales.crm"]).find(
      ({ key }) => key === "selling",
    );
    expect(selling?.href).toBe("/ad-sales/calendar");
    expect(selling?.label).toBe("navigation.selling");
    expect(selling?.active("/ad-campaigns")).toBe(false);
  });

  it("keeps Ads visible alongside Selling and omits Settings", () => {
    const items = buildPwaNavigation([
      "dashboard",
      "finance",
      "channels",
      "adSales.crm",
      "advertising",
      "workspace",
    ]);

    expect(items.map(({ key }) => key)).toEqual([
      "selling",
      "finance",
      "telegram",
      "ads",
    ]);
    expect(
      items.find(({ key }) => key === "ads")?.active("/ad-campaigns"),
    ).toBe(true);
    expect(items.find(({ key }) => key === "workspace")).toBeUndefined();
  });
});
