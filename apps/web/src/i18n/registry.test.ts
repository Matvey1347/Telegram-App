import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import {
  FEATURE_I18N_REGISTRY,
  namespacesForPath,
  telegramPostsNamespaces,
} from "./registry";

describe("feature i18n registry", () => {
  it("loads the isolated auth namespace on public identity routes", () => {
    expect(namespacesForPath("/login")).toEqual(["common", "auth"]);
    expect(namespacesForPath("/reset-password")).toEqual(["common", "auth"]);
    expect(namespacesForPath("/login")).not.toContain("navigation");
  });

  it("loads the account namespace only for the profile page", () => {
    expect(namespacesForPath("/account")).toEqual([
      "common",
      "navigation",
      "account",
    ]);
    expect(namespacesForPath("/settings")).not.toContain("account");
  });

  it("loads only base and current Telegram Posts route namespaces", () => {
    expect(telegramPostsNamespaces("/telegram-posts/groups")).toEqual([
      "common",
      "navigation",
      "ad-sales/common",
      "telegram/posts/common",
      "telegram/posts/groups",
    ]);
    expect(telegramPostsNamespaces("/telegram-posts/calendar")).not.toContain(
      "telegram/posts/import",
    );
    expect(telegramPostsNamespaces("/telegram-posts/calendar")).not.toContain(
      "telegram/posts/groups",
    );
    expect(telegramPostsNamespaces("/telegram-posts/calendar")).not.toContain(
      "telegram/posts/editor",
    );
  });

  it("keeps heavy import copy in a genuinely lazy namespace", async () => {
    expect(FEATURE_I18N_REGISTRY.posts.lazy.import).toEqual([
      "telegram/posts/import",
    ]);
    const catalog = await loadCatalog("ru", "telegram/posts/import");
    expect(catalog.default["telegram.posts.import.title"]).toBe(
      "Импорт канала",
    );
  });
});
