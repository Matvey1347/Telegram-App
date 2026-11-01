import { describe, expect, it } from "vitest";
import { isPersistedQuery, isWorkspaceScopedQuery } from "./query-provider";

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

  it("never persists private Lead Discovery evidence in browser query storage", () => { expect(isPersistedQuery(["lead-discovery","workspace-one","feed"])).toBe(false); });

  it("never persists manual communication history",()=>{expect(isPersistedQuery(["crm-manual","workspace-one","workflow","contact"])).toBe(false);});

  it("never persists the workspace notification cache", () => {
    expect(isPersistedQuery(["operations-notifications", "workspace-1"])).toBe(
      false,
    );
  });

  it.each([
    "telegram-publication-schedules",
    "mutual-promotion-folders",
    "cross-promotion-plans",
  ])("persists %s within its selected workspace cache", (root) => {
    expect(isPersistedQuery([root, "list"])).toBe(true);
  });
  it("includes workspace AI reads in shared workspace cancellation and refresh without persisting prompts", () => {
    expect(isWorkspaceScopedQuery(["operations", "ai", "workspace-one", "configuration"])).toBe(true);
    expect(isWorkspaceScopedQuery(["operations", "ai", "workspace-one", "analytics", "usage"])).toBe(true);
    expect(isWorkspaceScopedQuery(["operations", "unrelated-global"])).toBe(false);
    expect(isPersistedQuery(["operations", "ai", "workspace-one", "configuration"])).toBe(false);
  });

});
