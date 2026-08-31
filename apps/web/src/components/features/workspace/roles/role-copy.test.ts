import { describe, expect, it } from "vitest";
import { WORKSPACE_FEATURE_REGISTRY } from "@telegram-system/shared";
import {
  capabilityLabel,
  permissionIsEnabled,
  summarizeRole,
} from "./role-copy";

describe("role access presentation", () => {
  it("summarizes an own-data role and hidden features", () => {
    const keys = new Set(["posts.view", "posts.create", "posts.editOwn"]);
    const summary = summarizeRole(
      WORKSPACE_FEATURE_REGISTRY,
      "ALLOWLIST",
      keys,
    );
    expect(summary).toContain("Can work with own data in Posts");
    expect(summary).toMatch(/No access to .*Finance/);
  });

  it("interprets denylist keys as exceptions", () => {
    const exceptions = new Set(["finance.view"]);
    expect(permissionIsEnabled("DENYLIST", exceptions, "finance.view")).toBe(
      false,
    );
    expect(permissionIsEnabled("DENYLIST", exceptions, "channels.view")).toBe(
      true,
    );
  });

  it.each([
    ["viewOwn", "View own"],
    ["viewAny", "View all"],
    ["sendManualMessages", "Send manual messages"],
  ])("presents the %s CRM capability with a readable label", (key, label) => {
    expect(capabilityLabel(key)).toBe(label);
  });
});
