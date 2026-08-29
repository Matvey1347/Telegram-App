import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { TelegramManagedPost } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import {
  reconcileManagedPost,
  upsertManagedPostInCache,
} from "./managed-post-cache";

const post = (id: string, title: string) => ({ id, title }) as TelegramManagedPost;

describe("upsertManagedPostInCache", () => {
  it("replaces only the post returned by an update mutation", () => {
    expect(
      upsertManagedPostInCache(
        { items: [post("1", "Old"), post("2", "Other")], pagination: { totalItems: 2, page: 1, pageSize: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        post("1", "New"),
      )?.items,
    ).toEqual([post("1", "New"), post("2", "Other")]);
  });

  it("does not insert an entity into a page whose membership is unknown", () => {
    const page = { items: [post("1", "Existing")], pagination: { totalItems: 2, page: 2, pageSize: 1, totalPages: 2, hasNextPage: false, hasPreviousPage: true } };
    expect(upsertManagedPostInCache(page, post("2", "Created"))).toBe(page);
  });

  it("reconciles every containing page and the exact detail cache", () => {
    const queryClient = new QueryClient();
    const firstKey = telegramPostKeys.managedList("channel", { page: 1, pageSize: 50 });
    const filteredKey = telegramPostKeys.managedList("channel", { page: 1, pageSize: 50, search: "old" });
    const otherKey = telegramPostKeys.managedList("channel", { page: 2, pageSize: 50 });
    const page = (items: TelegramManagedPost[]) => ({ items, pagination: { totalItems: items.length, page: 1, pageSize: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    queryClient.setQueryData(firstKey, page([post("1", "Old")]));
    queryClient.setQueryData(filteredKey, page([post("1", "Old")]));
    queryClient.setQueryData(otherKey, page([post("2", "Other")]));

    reconcileManagedPost(queryClient, "channel", post("1", "New"));

    expect((queryClient.getQueryData(firstKey) as ReturnType<typeof page>).items[0].title).toBe("New");
    expect((queryClient.getQueryData(filteredKey) as ReturnType<typeof page>).items[0].title).toBe("New");
    expect((queryClient.getQueryData(otherKey) as ReturnType<typeof page>).items[0].title).toBe("Other");
    expect(queryClient.getQueryData(telegramPostKeys.managedDetail("channel", "1"))).toEqual(post("1", "New"));
  });
});
