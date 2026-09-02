import { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  OperationsNotificationItem,
  OperationsNotificationPage,
} from "@telegram-system/shared";
import { describe, expect, it, vi } from "vitest";
import { operationsNotificationKeys } from "@/lib/query-keys";
import {
  optimisticallyMarkNotificationsRead,
  patchCreatedNotification,
  restoreNotificationCache,
} from "./operations-notifications-query";

const notification = (id: string, readAt: string | null = null) =>
  ({
    id,
    workspaceId: "workspace-1",
    readAt,
    title: "Title",
  }) as OperationsNotificationItem;

describe("operations notification cache", () => {
  it("patches only the narrow workspace count and open list", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    client.setQueryData(operationsNotificationKeys.unread("workspace-1"), {
      unread: 2,
    });
    client.setQueryData<InfiniteData<OperationsNotificationPage>>(
      operationsNotificationKeys.list("workspace-1"),
      {
        pages: [{ items: [notification("n1")], nextCursor: null }],
        pageParams: [null],
      },
    );

    patchCreatedNotification(client, "workspace-1", notification("n2"));

    expect(
      client.getQueryData(operationsNotificationKeys.unread("workspace-1")),
    ).toEqual({ unread: 3 });
    expect(
      client
        .getQueryData<
          InfiniteData<OperationsNotificationPage>
        >(operationsNotificationKeys.list("workspace-1"))
        ?.pages[0]?.items.map((item) => item.id),
    ).toEqual(["n2", "n1"]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rolls optimistic reads back without root invalidation", () => {
    const client = new QueryClient();
    const listKey = operationsNotificationKeys.list("workspace-1");
    client.setQueryData(operationsNotificationKeys.unread("workspace-1"), {
      unread: 2,
    });
    client.setQueryData<InfiniteData<OperationsNotificationPage>>(listKey, {
      pages: [
        { items: [notification("n1"), notification("n2")], nextCursor: null },
      ],
      pageParams: [null],
    });
    const snapshot = optimisticallyMarkNotificationsRead(
      client,
      "workspace-1",
      ["n1"],
      "read-now",
    );
    expect(
      client.getQueryData<{ unread: number }>(
        operationsNotificationKeys.unread("workspace-1"),
      )?.unread,
    ).toBe(1);
    expect(
      client.getQueryData<InfiniteData<OperationsNotificationPage>>(listKey)
        ?.pages[0]?.items[0]?.readAt,
    ).toBe("read-now");

    restoreNotificationCache(client, "workspace-1", snapshot);
    expect(
      client.getQueryData<{ unread: number }>(
        operationsNotificationKeys.unread("workspace-1"),
      )?.unread,
    ).toBe(2);
    expect(
      client.getQueryData<InfiniteData<OperationsNotificationPage>>(listKey)
        ?.pages[0]?.items[0]?.readAt,
    ).toBeNull();
  });
});
