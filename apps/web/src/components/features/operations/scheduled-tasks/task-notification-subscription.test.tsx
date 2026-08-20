import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { TaskGroupNotificationSubscription } from "./task-notification-subscription";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    subscriptions: vi.fn(),
    updateGroupSubscriptions: vi.fn(),
  },
}));

const workspaceId = "workspace-a";
const taskKeys = ["telegram.channels.full_sync", "telegram.post_metrics.sync"];

function renderSubscription() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TaskGroupNotificationSubscription
        workspaceId={workspaceId}
        groupKey="TELEGRAM"
        taskKeys={taskKeys}
      />
    </QueryClientProvider>,
  );
  return { client };
}

describe("TaskGroupNotificationSubscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads checked preferences and updates only the explicit workspace", async () => {
    vi.mocked(telegramSystemBotApi.subscriptions).mockResolvedValue({
      connected: true,
      botUsername: "system_bot",
      workspaceId,
      items: [
        {
          workspaceId,
          taskKey: taskKeys[0],
          enabled: true,
          notifyOnSuccess: true,
          notifyOnFailure: false,
        },
        {
          workspaceId,
          taskKey: taskKeys[1],
          enabled: true,
          notifyOnSuccess: true,
          notifyOnFailure: false,
        },
      ],
    });
    vi.mocked(telegramSystemBotApi.updateGroupSubscriptions).mockResolvedValue({
      connected: true,
      botUsername: "system_bot",
      workspaceId,
      items: [],
    });
    renderSubscription();

    expect(
      await screen.findByText("Connection: Connected"),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Success" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Failure" }));

    await waitFor(() =>
      expect(telegramSystemBotApi.updateGroupSubscriptions).toHaveBeenCalledWith({
        workspaceId,
        groupKey: "TELEGRAM",
        notifyOnSuccess: true,
        notifyOnFailure: true,
      }),
    );
  });

  it("shows an actionable state without enabling controls when disconnected", async () => {
    vi.mocked(telegramSystemBotApi.subscriptions).mockResolvedValue({
      connected: false,
      botUsername: "system_bot",
      workspaceId,
      items: [],
    });
    renderSubscription();

    expect(
      await screen.findByText("Connection: Not connected"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "https://t.me/system_bot?start=connect",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps a failed preference save observable", async () => {
    vi.mocked(telegramSystemBotApi.subscriptions).mockResolvedValue({
      connected: true,
      botUsername: "system_bot",
      workspaceId,
      items: [],
    });
    vi.mocked(telegramSystemBotApi.updateGroupSubscriptions).mockRejectedValue(
      new Error("save failed"),
    );
    renderSubscription();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Success" }),
    );
    expect(
      await screen.findByText(
        "Could not save your notification preference. Try again.",
      ),
    ).toBeInTheDocument();
  });
});
