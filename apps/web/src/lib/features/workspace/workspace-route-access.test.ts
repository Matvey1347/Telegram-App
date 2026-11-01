import { describe, expect, it } from "vitest";
import {
  resolveWorkspacePath,
  workspaceLandingPath,
  workspacePathIsAllowed,
} from "./workspace-route-access";

describe("workspace route access", () => {
  it("allows leads-only roles into Discovery without granting CRM client or sales access", () => {
    const access = { featureIds: ["adSales.leads"] };
    expect(workspaceLandingPath(access)).toBe("/ad-sales/leads");
    expect(workspacePathIsAllowed("/ad-sales/leads", access)).toBe(true);
    expect(workspacePathIsAllowed("/ad-sales/clients", access)).toBe(false);
    expect(
      workspacePathIsAllowed("/ad-sales/leads", {
        featureIds: ["adSales.crm"],
      }),
    ).toBe(false);
  });

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

  it("allows the consolidated settings hub for operations and members roles", () => {
    expect(
      workspacePathIsAllowed("/settings", { featureIds: ["operations"] }),
    ).toBe(true);
    expect(
      workspacePathIsAllowed("/settings", { featureIds: ["members"] }),
    ).toBe(true);
  });
  it("preserves a notification for another workspace until its membership can be checked", () => {
    const destination =
      "/ad-sales/inbox?conversationId=conversation-target&workspaceId=workspace-target";
    expect(
      resolveWorkspacePath(
        destination,
        contentManagerAccess,
        "workspace-current",
      ),
    ).toBe(destination);
    expect(
      resolveWorkspacePath(
        destination,
        contentManagerAccess,
        "workspace-target",
      ),
    ).toBe("/telegram-posts");
  });
});
