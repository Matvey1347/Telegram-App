import { describe, expect, it } from "vitest";
import { includeDeepLinkedManagedPost } from "./managed-post-page";

describe("includeDeepLinkedManagedPost", () => {
  it("replaces a stale list entry with the freshly fetched deep-linked post", () => {
    const stalePost = {
      id: "post-1",
      scheduledAt: "2026-10-07T16:00:00.000Z",
      scheduleTimezone: null,
    };
    const freshPost = {
      ...stalePost,
      scheduleTimezone: "Europe/Kyiv",
    };

    expect(
      includeDeepLinkedManagedPost([stalePost as never], freshPost as never),
    ).toEqual([freshPost]);
  });
});
