import { describe, expect, it } from "vitest";
import {
  createAppQueryClient,
  isPersistedQuery,
  isWorkspaceScopedQuery,
} from "./query-provider";

describe("daily Telegram read cache policy", () => {
  it("shares a one-day stale time across every consumer of expensive list keys", () => {
    const client = createAppQueryClient();
    const expectedStaleTime = 24 * 60 * 60_000;

    expect(
      client.getQueryDefaults(["telegram-channels", "lifecycle-list"])
        .staleTime,
    ).toBe(expectedStaleTime);
    expect(
      client.getQueryDefaults(["telegram-channel-networks"]).staleTime,
    ).toBe(expectedStaleTime);
    expect(
      client.getQueryDefaults(["telegram-channel-networks", "options"])
        .staleTime,
    ).toBe(expectedStaleTime);
    expect(
      client.getQueryDefaults(["telegram-publication-schedules", "list"])
        .staleTime,
    ).toBe(expectedStaleTime);
    expect(
      client.getQueryDefaults(["telegram-channels", "select"]).staleTime,
    ).toBe(15 * 60_000);
    expect(
      client.getQueryDefaults(["telegram-channels", "select", { owned: true }])
        .staleTime,
    ).toBe(15 * 60_000);
    expect(
      client.getQueryDefaults([
        "telegram-crm",
        "contacts",
        "list",
        { page: 1 },
      ]).staleTime,
    ).toBe(2 * 60_000);
    expect(client.getQueryDefaults(["telegram-user-accounts"]).staleTime).toBe(
      expectedStaleTime,
    );
    expect(
      client.getQueryDefaults(["telegram-bots", "configured"]).staleTime,
    ).toBe(15 * 60_000);
    expect(client.getQueryDefaults(["currency-settings"]).staleTime).toBe(
      expectedStaleTime,
    );
    expect(client.getQueryDefaults(["currency-rates-latest"]).staleTime).toBe(
      15 * 60_000,
    );
    expect(client.getQueryDefaults(["workspaces"]).staleTime).toBe(
      expectedStaleTime,
    );
    expect(client.getQueryDefaults(["account-shell"]).staleTime).toBe(
      expectedStaleTime,
    );
    expect(client.getQueryDefaults(["advertising-people"]).staleTime).toBe(
      15 * 60_000,
    );
    expect(client.getDefaultOptions().queries?.staleTime).toBe(4 * 60_000);
    client.clear();
  });
});

describe("workspace query isolation", () => {
  it.each([
    "lead-discovery",
    "crm-manual",
    "ad-campaign-admission-view-analytics",
    "campaign-invite-link-history",
    "telegram-bots",
    "telegram-system-bot",
    "telegram-source-channels",
    "telegram-user-accounts",
    "telegram-channel-custom-emoji-packs",
    "telegram-managed-posts-calendar",
    "telegram-publication-schedules",
    "dashboard-summary",
    "telegram-channel-reminders",
    "advertising-people",
    "telegram-managed-post-history",
    "telegram-post-batches",
    "telegram-ad-baseline",
    "telegram-crm",
    "mutual-promotion-folders",
    "cross-promotion-plans",
    "icons",
    "trash",
    "operations-notifications",
  ])("marks %s as workspace scoped", (root) => {
    expect(isWorkspaceScopedQuery([root, "detail"])).toBe(true);
  });

  it.each(["auth", "workspaces"])(
    "keeps %s across a workspace switch",
    (root) => {
      expect(isWorkspaceScopedQuery([root])).toBe(false);
    },
  );

  it("persists the workspace-scoped advertising people catalog", () => {
    expect(isPersistedQuery(["advertising-people"])).toBe(true);
    expect(isWorkspaceScopedQuery(["advertising-people"])).toBe(true);
  });

  it("never persists private Lead Discovery evidence in browser query storage", () => {
    expect(isPersistedQuery(["lead-discovery", "workspace-one", "feed"])).toBe(
      false,
    );
  });

  it("never persists manual communication history", () => {
    expect(
      isPersistedQuery(["crm-manual", "workspace-one", "workflow", "contact"]),
    ).toBe(false);
  });

  it("keeps CRM contact pages out of persistent browser storage", () => {
    expect(
      isPersistedQuery([
        "telegram-crm",
        "contacts",
        "list",
        { page: 1, pageSize: 20 },
      ]),
    ).toBe(false);
  });

  it("persists only the compact configured-bot overview", () => {
    expect(isPersistedQuery(["telegram-bots", "configured"])).toBe(true);
    expect(
      isPersistedQuery([
        "telegram-bots",
        "configured",
        "finance-users",
        "LOCAL",
      ]),
    ).toBe(false);
    expect(isPersistedQuery(["telegram-bots"])).toBe(false);
  });

  it("keeps full managed-post archives in memory without serializing them into localStorage", () => {
    expect(
      isPersistedQuery([
        "telegram-managed-posts",
        "channel-1",
        "list",
        { all: true },
      ]),
    ).toBe(false);
    expect(
      isPersistedQuery([
        "telegram-managed-posts",
        "channel-1",
        "list",
        { page: 1, pageSize: 50 },
      ]),
    ).toBe(true);
    expect(
      isWorkspaceScopedQuery([
        "telegram-managed-posts",
        "channel-1",
        "list",
        { all: true },
      ]),
    ).toBe(true);
  });

  it("never persists the workspace notification cache", () => {
    expect(isPersistedQuery(["operations-notifications", "workspace-1"])).toBe(
      false,
    );
  });

  it("persists only the bounded current-month dashboard summary", () => {
    const currentMonth = [
      "dashboard-summary",
      "month",
      "2026-11-01",
      "2026-11-30",
    ] as const;
    expect(isPersistedQuery(currentMonth)).toBe(true);
    expect(isPersistedQuery(["dashboard-summary", "all", null, null])).toBe(
      false,
    );
    expect(
      isPersistedQuery([
        "dashboard-summary",
        "custom",
        "2026-01-01",
        "2026-01-31",
      ]),
    ).toBe(false);
    expect(
      isPersistedQuery(["dashboard-summary", "month", "bad", "dates"]),
    ).toBe(false);
  });

  it("persists only bounded ad calendar availability windows", () => {
    const validKey = [
      "telegram-ad-availability",
      {
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-12-13T23:59:59.999Z",
        channelIds: Array.from(
          { length: 30 },
          (_, index) => `channel-${index}`,
        ),
      },
    ] as const;
    expect(isPersistedQuery(validKey)).toBe(true);
    expect(isWorkspaceScopedQuery(validKey)).toBe(true);
    expect(
      isPersistedQuery([
        "telegram-ad-availability",
        {
          ...validKey[1],
          channelIds: Array.from({ length: 31 }, (_, i) => `channel-${i}`),
        },
      ]),
    ).toBe(false);
    expect(
      isPersistedQuery([
        "telegram-ad-availability",
        { ...validKey[1], to: "2027-03-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
  });

  it.each([
    "telegram-publication-schedules",
    "telegram-channel-networks",
    "mutual-promotion-folders",
    "cross-promotion-plans",
  ])("persists %s within its selected workspace cache", (root) => {
    expect(isPersistedQuery([root, "list"])).toBe(true);
  });

  it("persists and workspace-scopes compact network options", () => {
    const key = ["telegram-channel-networks", "options"];
    expect(isPersistedQuery(key)).toBe(true);
    expect(isWorkspaceScopedQuery(key)).toBe(true);
  });

  it("persists the exact publication calendar range key and scopes it to the workspace", () => {
    const now = Date.now();
    const calendarKey = [
      "telegram-publication-schedules",
      "calendar",
      "schedule-1",
      {
        from: new Date(now - 7 * 24 * 60 * 60_000).toISOString(),
        to: new Date(now + 35 * 24 * 60 * 60_000).toISOString(),
      },
    ] as const;

    expect(isPersistedQuery(calendarKey)).toBe(true);
    expect(isWorkspaceScopedQuery(calendarKey)).toBe(true);
  });

  it("keeps distant, oversized, and multi-channel slot availability out of persistent storage", () => {
    const now = Date.now();
    const key = (from: number, to: number) =>
      [
        "telegram-publication-schedules",
        "calendar",
        "schedule-1",
        { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      ] as const;

    expect(
      isPersistedQuery(key(now - 90 * 86_400_000, now - 48 * 86_400_000)),
    ).toBe(false);
    expect(isPersistedQuery(key(now, now + 46 * 86_400_000))).toBe(false);
    expect(
      isPersistedQuery([
        "telegram-publication-schedules",
        "occurrences-by-channels",
        Array.from({ length: 100 }, (_, index) => `channel-${index}`),
        {
          from: new Date(now).toISOString(),
          to: new Date(now + 62 * 86_400_000).toISOString(),
        },
      ]),
    ).toBe(false);
  });

  it("persists only the current channel post calendar range", () => {
    const now = Date.now();
    const calendarKey = (from: number, to: number) =>
      [
        "telegram-managed-posts-calendar",
        "channel-1",
        new Date(from).toISOString(),
        new Date(to).toISOString(),
      ] as const;

    expect(
      isPersistedQuery(
        calendarKey(now - 7 * 86_400_000, now + 35 * 86_400_000),
      ),
    ).toBe(true);
    expect(
      isPersistedQuery(
        calendarKey(now - 90 * 86_400_000, now - 48 * 86_400_000),
      ),
    ).toBe(false);
    expect(isPersistedQuery(calendarKey(now, now + 46 * 86_400_000))).toBe(
      false,
    );
  });
  it("includes workspace AI reads in shared workspace cancellation and refresh without persisting prompts", () => {
    expect(
      isWorkspaceScopedQuery([
        "operations",
        "ai",
        "workspace-one",
        "configuration",
      ]),
    ).toBe(true);
    expect(
      isWorkspaceScopedQuery([
        "operations",
        "ai",
        "workspace-one",
        "analytics",
        "usage",
      ]),
    ).toBe(true);
    expect(isWorkspaceScopedQuery(["operations", "unrelated-global"])).toBe(
      false,
    );
    expect(
      isPersistedQuery(["operations", "ai", "workspace-one", "configuration"]),
    ).toBe(false);
  });
});
