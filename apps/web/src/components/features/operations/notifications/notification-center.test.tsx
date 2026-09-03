import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OperationsNotificationItem } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { NotificationCenter } from "./notification-center";

vi.mock("./use-notification-realtime", () => ({
  useNotificationRealtime: vi.fn(),
}));
vi.mock("./notification-push-settings", () => ({
  NotificationPushSettings: () => <div>Push settings</div>,
}));

function item(
  id: string,
  priority: OperationsNotificationItem["priority"],
  readAt: string | null = null,
): OperationsNotificationItem {
  return {
    id,
    workspaceId: "workspace-1",
    recipientMemberId: "member-1",
    type:
      priority === "HIGH" ? "CRM_PLACEMENT_FAILURE" : "CRM_MESSAGE_RECEIVED",
    priority,
    copyKey:
      priority === "HIGH"
        ? "crm.notification.placementFailure"
        : "crm.notification.messageReceived",
    title: `${priority} notification`,
    body: "Open the CRM activity.",
    metadata: {},
    targetUrl: `/ad-sales/inbox?conversationId=${id}`,
    readAt,
    createdAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-10-01T10:00:00.000Z",
  };
}

function renderCenter(compact = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationCenter workspaceId="workspace-1" enabled compact={compact} />
    </QueryClientProvider>,
  );
  return client;
}

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(operationsNotificationsApi, "unreadCount").mockResolvedValue({
      unread: 101,
    });
    vi.spyOn(operationsNotificationsApi, "markRead").mockResolvedValue({
      unread: 100,
    });
    vi.spyOn(operationsNotificationsApi, "markVisibleRead").mockResolvedValue({
      unread: 100,
    });
    vi.spyOn(operationsNotificationsApi, "markAllRead").mockResolvedValue({
      unread: 0,
    });
  });

  it("uses the compact trigger size inside the sidebar action row", async () => {
    renderCenter(true);

    expect(
      await screen.findByRole("button", { name: "Notifications, 101 unread" }),
    ).toHaveClass("h-8", "w-8");
  });

  it("caps the accessible badge, labels priority/read state, and bounds pagination", async () => {
    let paginationFails = true;
    const list = vi
      .spyOn(operationsNotificationsApi, "list")
      .mockImplementation(async ({ cursor }) => {
        if (!cursor) {
          return {
            items: [item("high", "HIGH"), item("low", "LOW", "read")],
            nextCursor: "next",
          };
        }
        if (paginationFails) {
          paginationFails = false;
          throw new Error("page failed");
        }
        return { items: [item("normal", "NORMAL")], nextCursor: null };
      });
    renderCenter();

    const trigger = await screen.findByRole("button", {
      name: "Notifications, 101 unread",
    });
    expect(trigger).toHaveTextContent("99+");
    await userEvent.click(trigger);
    expect(await screen.findByText("High priority")).toBeInTheDocument();
    expect(screen.getByText("Low priority")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Unread HIGH notification" }),
    ).toHaveAttribute("href", "/ad-sales/inbox?conversationId=high");

    await userEvent.click(
      screen.getByRole("button", { name: "Mark visible read" }),
    );
    await waitFor(() => {
      expect(
        vi.mocked(operationsNotificationsApi.markVisibleRead).mock
          .calls[0]?.[0],
      ).toEqual(["high"]);
    });
    expect(screen.queryByText("Unread")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByText("More notifications could not be loaded."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("NORMAL notification")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(
      { limit: 25, cursor: "next" },
      expect.any(AbortSignal),
    );
  });

  it("renders the exact empty state", async () => {
    vi.spyOn(operationsNotificationsApi, "list").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderCenter();
    await userEvent.click(
      await screen.findByRole("button", { name: "Notifications, 101 unread" }),
    );
    expect(
      await screen.findByText(
        "You’re all caught up. New CRM activity will appear here.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an initial error with a retry", async () => {
    const list = vi
      .spyOn(operationsNotificationsApi, "list")
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderCenter();
    await userEvent.click(
      await screen.findByRole("button", { name: "Notifications, 101 unread" }),
    );
    expect(
      await screen.findByText("Notifications could not be loaded."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(
      "You’re all caught up. New CRM activity will appear here.",
    );
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and restores focus to the bell", async () => {
    vi.spyOn(operationsNotificationsApi, "list").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderCenter();
    const trigger = await screen.findByRole("button", {
      name: "Notifications, 101 unread",
    });
    await userEvent.click(trigger);
    expect(
      await screen.findByRole("dialog", { name: "Notifications" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
