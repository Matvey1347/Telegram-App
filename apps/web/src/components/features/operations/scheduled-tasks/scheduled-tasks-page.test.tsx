import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduledTasksApi, type ScheduledTaskView } from "@/lib/api";
import { scheduledTaskKeys } from "@/lib/query-keys";
import { ScheduledTasksPage } from "./scheduled-tasks-page";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  scheduledTasksApi: {
    list: vi.fn(),
    runs: vi.fn(),
    update: vi.fn(),
    runNow: vi.fn(),
  },
}));

const runsMock = vi.mocked(scheduledTasksApi.runs);
const listMock = vi.mocked(scheduledTasksApi.list);
const task: ScheduledTaskView = {
  key: "telegram-sync",
  name: "Telegram sync",
  description: "Synchronize Telegram data",
  scope: "WORKSPACE_OPERATION" as const,
  scheduleEditable: true,
  supportedFrequencies: ["DAILY"],
  notificationSupported: false,
  defaultSchedule: { frequency: "DAILY", time: "09:00", timezone: "UTC" },
  group: { key: "TELEGRAM" as const, name: "Telegram", description: "Telegram tasks" },
  workspaceId: "workspace-1",
  enabled: true,
  schedule: { frequency: "DAILY", time: "09:00", timezone: "UTC" },
  notifications: { notifyOnSuccess: false, notifyOnFailure: false, channel: "SYSTEM_TELEGRAM_BOT" },
  notificationState: "NOT_SUPPORTED",
  lastRun: null,
  nextRunAt: null,
  canRunNow: false,
  canEdit: true,
};

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({ items: [task] });
  runsMock.mockReset().mockResolvedValue([]);
});

describe("ScheduledTasksPage dialogs", () => {
  it("does not mount modal workflows until the user opens one", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(scheduledTaskKeys.list(), { items: [task] });

    render(
      <QueryClientProvider client={client}>
        <ScheduledTasksPage />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByRole("dialog", { name: "Telegram sync history" })).toBeInTheDocument();
    expect(runsMock).toHaveBeenCalledWith("telegram-sync", 20);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Telegram sync" })).toBeInTheDocument();
  });
});
