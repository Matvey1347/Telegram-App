import { describe, expect, it } from "vitest";
import type { TelegramManagedPost } from "@/lib/api";
import { groupEditorialDraftSections } from "./group-editorial-draft-sections";
import type { PostSidebarSection } from "./telegram-post-workspace-model";

function section(id: string, status: TelegramManagedPost["status"] = "DRAFT"): PostSidebarSection {
  return {
    key: `post:${id}`,
    group: null,
    posts: [{ id, status } as TelegramManagedPost],
    pendingPosts: [],
  };
}

const pair = (postId: string, sphereId: string) => ({
  postId,
  sphereId,
  sphereName: sphereId,
  rubricId: "shared-rubric",
  rubricName: "Shared rubric",
});

describe("editorial draft sections", () => {
  it("uses the full pair as the group identity and keeps other posts visible", () => {
    const unclassified = section("unclassified");
    const scheduled = section("scheduled", "SCHEDULED");
    const groups = groupEditorialDraftSections(
      [section("first"), unclassified, section("second"), scheduled, section("third")],
      [pair("first", "Home"), pair("second", "Work"), pair("third", "Home"), pair("scheduled", "Home")],
    );

    expect(groups.map(({ posts }) => posts.map(({ id }) => id))).toEqual([
      ["first", "third"], ["second"], ["unclassified"], ["scheduled"],
    ]);
    expect(groups[0].editorial).toMatchObject({ sphereName: "Home", rubricName: "Shared rubric" });
    expect(groups[1].key).not.toEqual(groups[0].key);
    expect(groups[2]).toBe(unclassified);
    expect(groups[3]).toBe(scheduled);
  });

  it("keeps the original sections when there is no valid assignment", () => {
    const sections = [section("unclassified")];
    expect(groupEditorialDraftSections(sections, undefined)).toBe(sections);
  });
});
