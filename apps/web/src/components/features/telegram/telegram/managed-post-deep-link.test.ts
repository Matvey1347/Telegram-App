import { describe, expect, it } from "vitest";
import {
  expandDeepLinkedPostGroup,
  managedPostStatusTab,
} from "./managed-post-deep-link";

describe("managed post deep links", () => {
  it.each([
    ["PUBLISHED", false, "PUBLISHED"],
    ["SCHEDULED", false, "SCHEDULED"],
    ["DRAFT", false, "DRAFT"],
    ["FAILED", false, "DRAFT"],
    ["PUBLISHED", true, "DRAFT"],
  ])("opens %s in its visible status tab", (status, broken, expected) => {
    expect(managedPostStatusTab(status, broken)).toBe(expected);
  });

  it("expands the linked post group while preserving other collapsed groups", () => {
    expect(
      expandDeepLinkedPostGroup(null, ["group-1", "group-2"], "group-2"),
    ).toEqual(["group-1"]);
    expect(
      expandDeepLinkedPostGroup(["group-2"], ["group-1", "group-2"], "group-2"),
    ).toEqual([]);
  });
});
