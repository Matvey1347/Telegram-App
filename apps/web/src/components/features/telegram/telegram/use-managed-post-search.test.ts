import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TelegramManagedPost } from "@/lib/api";
import { matchesManagedPostSearch } from "./use-managed-post-search";
import { useTelegramWorkspaceSearch } from "./posts-workspace/use-telegram-workspace-search";

function post(overrides: Partial<TelegramManagedPost> = {}) {
  return {
    id: "post-1",
    workspaceId: "workspace-1",
    telegramChannelId: "channel-1",
    origin: "SYSTEM",
    assignedMemberId: "member-1",
    assignedMember: {
      id: "member-1",
      user: { id: "user-1", name: "Matthew Kayden" },
    },
    title: "Weekly advertising report",
    text: "Revenue and campaign results",
    imageUrls: [],
    status: "DRAFT",
    telegramScheduledMessageIds: [],
    telegramMessageIds: ["456"],
    telegramMessageUrls: [],
    telegramIdVerificationStatus: "UNVERIFIED",
    telegramLinkSource: "AUTO",
    telegramRemoteStatus: "NONE",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as TelegramManagedPost;
}

describe("matchesManagedPostSearch", () => {
  it("matches title, body and Telegram message id case-insensitively", () => {
    expect(matchesManagedPostSearch(post(), "ADVERTISING")).toBe(true);
    expect(matchesManagedPostSearch(post(), "campaign revenue")).toBe(true);
    expect(matchesManagedPostSearch(post(), "456")).toBe(true);
  });

  it("matches group and assigned member context", () => {
    const context = {
      groupTitle: "Advertise system",
      memberName: "Matthew Kayden",
    };
    expect(matchesManagedPostSearch(post(), "advertise", context)).toBe(true);
    expect(matchesManagedPostSearch(post(), "matthew", context)).toBe(true);
  });

  it("requires every search term and rejects unrelated posts", () => {
    expect(matchesManagedPostSearch(post(), "weekly missing")).toBe(false);
    expect(matchesManagedPostSearch(post(), "something else")).toBe(false);
  });
});

describe("AI-only workspace search", () => {
  it("keeps origin, status and text filters independent and omits pending manual saves", () => {
    const ai = post({ id: "ai", aiGenerated: true });
    const options = {
      posts: { data: [ai, post({ id: "manual" }), post({ id: "published-ai", aiGenerated: true, status: "PUBLISHED" })] },
      pendingPostSaves: [{ id: "pending", title: ai.title }],
      savingPostIds: [],
      statusTab: "DRAFT",
      effectivePostGroup: () => null,
      effectivePostMember: () => null,
      effectivePostGroupId: () => null,
    } as unknown as Parameters<typeof useTelegramWorkspaceSearch>[0];
    const { result } = renderHook(() => useTelegramWorkspaceSearch(options));
    expect(result.current.visiblePosts.map(({ id }) => id)).toEqual(["ai", "manual"]);
    act(() => result.current.setAiOnly(true));
    expect(result.current.visiblePosts.map(({ id }) => id)).toEqual(["ai"]);
    expect(result.current.visiblePendingPostSaves).toEqual([]);
    act(() => result.current.setPostSearch("unrelated"));
    expect(result.current.visiblePosts).toEqual([]);
    act(() => {
      result.current.setPostSearch("advertising");
      result.current.setAiOnly(false);
    });
    expect(result.current.visiblePosts.map(({ id }) => id)).toEqual(["ai", "manual"]);
  });
});
