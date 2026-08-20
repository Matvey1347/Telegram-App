import { describe, expect, it } from "vitest";
import type { TelegramManagedPost } from "@/lib/api";
import { upsertManagedPostInCache } from "./managed-post-cache";

const post = (id: string, title: string) => ({ id, title }) as TelegramManagedPost;

describe("upsertManagedPostInCache", () => {
  it("replaces only the post returned by an update mutation", () => {
    expect(upsertManagedPostInCache([post("1", "Old"), post("2", "Other")], post("1", "New"))).toEqual([
      post("1", "New"), post("2", "Other"),
    ]);
  });

  it("adds a newly created post without requesting the full collection", () => {
    expect(upsertManagedPostInCache([post("1", "Existing")], post("2", "Created"))).toEqual([
      post("2", "Created"), post("1", "Existing"),
    ]);
  });
});
