import { describe, expect, it } from "vitest";
import { isPersistedQuery, isWorkspaceScopedQuery } from "./query-provider";

describe("workspace query isolation", () => {
  it.each([
    "ad-campaign-admission-view-analytics",
    "campaign-invite-link-history",
    "telegram-bots",
    "telegram-system-bot",
    "telegram-source-channels",
    "telegram-user-accounts",
    "telegram-channel-custom-emoji-packs",
    "telegram-managed-posts-calendar",
    "telegram-managed-post-history",
    "telegram-ad-baseline",
    "telegram-crm",
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

  it("never persists the workspace notification cache", () => {
    expect(isPersistedQuery(["operations-notifications", "workspace-1"])).toBe(
      false,
    );
  });
});
