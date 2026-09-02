import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification runtime policy", () => {
  it("keeps the service worker event-only without caching or periodic work", () => {
    const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).not.toMatch(/addEventListener\(["']fetch/u);
    expect(source).not.toMatch(/addEventListener\(["']periodicsync/u);
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("setTimeout");
  });

  it("does not add React Query polling to notification reads", () => {
    const sources = [
      "notification-center.tsx",
      "notification-push-settings.tsx",
      "use-notification-realtime.ts",
    ].map((file) =>
      readFileSync(
        resolve(
          process.cwd(),
          "src/components/features/operations/notifications",
          file,
        ),
        "utf8",
      ),
    );
    expect(sources.join("\n")).not.toContain("refetchInterval");
  });
});
