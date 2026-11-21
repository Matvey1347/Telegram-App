// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmProductionAction } from "./production-confirmation";

const settings = vi.hoisted(() => ({ isDevelopment: true, databaseEnvironment: "production" }));
vi.mock("@/config/public-env", () => ({ publicWebEnvironment: settings }));

describe("production mutation confirmation", () => {
  const path = "/api/telegram-channels/test-channel/managed-posts/reschedule-all-stream";

  beforeEach(() => {
    settings.databaseEnvironment = "production";
  });
  afterEach(() => vi.restoreAllMocks());

  it("binds the confirmation to the workspace, method, channel and exact posts", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const result = confirmProductionAction("POST", path, "test-workspace", { postIds: ["first", "second"] });
    expect(result).toBe(`POST test-workspace ${path} first,second`);
    expect(confirm.mock.calls[0][0]).toContain("PRODUCTION — LIVE ACTIONS");
    expect(confirm.mock.calls[0][0]).toContain("Posts first, second");
  });

  it("rejects cancellation and leaves normal development and login alone", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(() => confirmProductionAction("POST", path, "test-workspace")).toThrow("cancelled");
    expect(confirmProductionAction("POST", "/api/auth/login", undefined)).toBeUndefined();
    settings.databaseEnvironment = "local";
    expect(confirmProductionAction("POST", path, "test-workspace")).toBeUndefined();
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
