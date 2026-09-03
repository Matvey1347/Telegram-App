import { describe, expect, it } from "vitest";
import {
  resolveWorkspacePath,
  workspaceLandingPath,
  workspacePathIsAllowed,
} from "./workspace-route-access";

describe("workspace route access", () => {
  const contentManagerAccess = { featureIds: ["posts"] };

  it("uses publications as the landing page for a posts-only member", () => {
    expect(workspaceLandingPath(contentManagerAccess)).toBe("/telegram-posts");
    expect(resolveWorkspacePath("/", contentManagerAccess)).toBe(
      "/telegram-posts",
    );
  });

  it("keeps dashboard as the landing page when it is accessible", () => {
    const ownerAccess = { featureIds: ["dashboard", "posts"] };
    expect(workspaceLandingPath(ownerAccess)).toBe("/");
    expect(resolveWorkspacePath("/", ownerAccess)).toBe("/");
  });

  it("rejects dashboard but allows publication routes", () => {
    expect(workspacePathIsAllowed("/", contentManagerAccess)).toBe(false);
    expect(
      workspacePathIsAllowed(
        "/telegram-posts/channel-1/calendar",
        contentManagerAccess,
      ),
    ).toBe(true);
  });

  it("preserves an allowed return path including its query string", () => {
    expect(
      resolveWorkspacePath(
        "/telegram-posts?view=calendar",
        contentManagerAccess,
      ),
    ).toBe("/telegram-posts?view=calendar");
  });

  it("falls back to account settings when no product is accessible", () => {
    expect(workspaceLandingPath({ featureIds: [] })).toBe("/account");
  });
});
