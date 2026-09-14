import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { render } from "@testing-library/react";
import {
  telegramPostBatchKeys,
  telegramPostKeys,
  telegramSystemBotKeys,
} from "@/lib/query-keys";
import { PostFromBotModal } from "./post-from-bot-modal";

const batch: TelegramPostBatch = {
  id: "batch-1",
  title: "Imported campaign",
  status: "DRAFT",
  version: 2,
  postCount: 1,
  channelCount: 1,
  deliveryCount: 0,
  scheduledCount: 0,
  publishedCount: 0,
  failedCount: 0,
  nextPublicationAt: null,
  nextDeleteAt: null,
  createdAt: "2026-09-14T10:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  channelIds: ["channel-1"],
  defaultDeleteAfterHours: 24,
  posts: [],
  associations: [],
};

const apiMocks = vi.hoisted(() => ({
  flowStorageKey: undefined as string | undefined,
  connection: vi.fn(),
  prepareImport: vi.fn().mockResolvedValue({ workflowId: "workflow-1" }),
  importResult: vi.fn().mockResolvedValue({ ready: true, drafts: [] }),
  importWorkflow: vi.fn(),
  list: vi.fn().mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  }),
  detail: vi.fn(),
  update: vi.fn(),
  dispatch: vi.fn(),
  link: vi.fn(),
  linkTargets: vi.fn().mockResolvedValue([]),
  deliveries: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    connection: apiMocks.connection,
  },
}));

vi.mock("@/lib/features/telegram/telegram-post-batches-api", () => ({
  telegramPostBatchesApi: apiMocks,
}));

vi.mock("@/hooks/use-telegram-system-bot-post-flow", () => ({
  useTelegramSystemBotPostFlow: (options: {
    storageKey?: string;
    prepareImport: () => Promise<string>;
    readImport: (
      workflowId: string,
    ) => Promise<{ ready: false } | { ready: true; value: TelegramPostBatch }>;
    onImported: (batch: TelegramPostBatch) => void;
  }) => {
    apiMocks.flowStorageKey = options.storageKey;
    return {
      importStatus: "idle",
      error: "",
      reset: vi.fn(),
      checkImport: vi.fn(),
      startImport: async () => {
        const workflowId = await options.prepareImport();
        const result = await options.readImport(workflowId);
        if (result.ready) options.onImported(result.value);
      },
    };
  },
}));

vi.mock("./post-batch-editor", () => ({
  PostBatchEditor: ({
    batch: value,
    onDispatch,
  }: {
    batch: TelegramPostBatch;
    onDispatch: (batch: TelegramPostBatch) => Promise<void>;
  }) => (
    <div>
      <span>Editor: {value.title}</span>
      <button
        type="button"
        onClick={() => void onDispatch(value).catch(() => undefined)}
      >
        Dispatch imported batch
      </button>
    </div>
  ),
}));
vi.mock("./post-batch-associations", () => ({
  PostBatchAssociations: () => null,
}));
vi.mock("./post-batch-deliveries", () => ({
  PostBatchDeliveries: () => null,
}));

describe("PostFromBotModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.connection.mockResolvedValue({
      connected: true,
      botUsername: "system_bot",
      currentWorkspaceId: "workspace-1",
    });
    apiMocks.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
  });

  it("persists the ready import, selects it, and invalidates every channel after dispatch", async () => {
    apiMocks.importWorkflow.mockResolvedValue(batch);
    apiMocks.detail.mockResolvedValue(batch);
    apiMocks.update.mockResolvedValue({ ...batch, version: 3 });
    apiMocks.dispatch.mockResolvedValue({
      batch: { ...batch, version: 3, status: "ACTIVE", deliveryCount: 1 },
      queuedDeliveries: 1,
      alreadyQueued: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <TestI18nProvider>
          <PostFromBotModal open channels={[]} onClose={vi.fn()} />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    const importButton = await screen.findByRole("button", {
      name: "Add posts via bot",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    expect(apiMocks.flowStorageKey).toBe(
      "telegram-system-bot-post-batch-import:workspace-1",
    );
    fireEvent.click(importButton);

    expect(await screen.findByText("Editor: Imported campaign")).toBeVisible();
    expect(apiMocks.importWorkflow).toHaveBeenCalledWith("workflow-1");

    fireEvent.click(
      screen.getByRole("button", { name: "Dispatch imported batch" }),
    );
    await waitFor(() =>
      expect(apiMocks.dispatch).toHaveBeenCalledWith("batch-1", 3),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostBatchKeys.deliveriesRoot("batch-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostKeys.managedLists("channel-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostKeys.managedCalendar("channel-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostKeys.postGroups("channel-1"),
    });
  });

  it("keeps the saved version authoritative and refetches after an ambiguous dispatch failure", async () => {
    const saved = { ...batch, version: 3, title: "Saved campaign" };
    const savedRetry = { ...saved, version: 4 };
    apiMocks.list.mockResolvedValue({
      items: [batch],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    apiMocks.detail.mockResolvedValue(saved);
    apiMocks.update
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce(savedRetry);
    apiMocks.dispatch
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({
        batch: { ...savedRetry, status: "ACTIVE", deliveryCount: 1 },
        queuedDeliveries: 1,
        alreadyQueued: false,
      });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const setQueryData = vi.spyOn(queryClient, "setQueryData");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <TestI18nProvider>
          <PostFromBotModal open channels={[]} onClose={vi.fn()} />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Editor: Saved campaign")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Dispatch imported batch" }),
    );

    await waitFor(() =>
      expect(apiMocks.dispatch).toHaveBeenCalledWith("batch-1", 3),
    );
    expect(setQueryData).toHaveBeenCalledWith(
      telegramPostBatchKeys.detail("batch-1"),
      saved,
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramPostBatchKeys.detail("batch-1"),
    });
    expect(
      await screen.findByText("Could not dispatch this batch."),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Dispatch imported batch" }),
    );
    await waitFor(() => expect(apiMocks.dispatch).toHaveBeenCalledTimes(2));
    expect(apiMocks.update.mock.calls[1][1]).toMatchObject({
      expectedVersion: 3,
    });
    expect(apiMocks.dispatch).toHaveBeenLastCalledWith("batch-1", 4);
  });

  it("drops the selected batch when the active workspace changes", async () => {
    const secondBatch = {
      ...batch,
      id: "batch-2",
      title: "Second workspace-sensitive batch",
    };
    apiMocks.list.mockResolvedValue({
      items: [batch, secondBatch],
      pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
    });
    apiMocks.detail.mockImplementation((batchId: string) =>
      Promise.resolve(batchId === secondBatch.id ? secondBatch : batch),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TestI18nProvider>
          <PostFromBotModal open channels={[]} onClose={vi.fn()} />
        </TestI18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Second workspace-sensitive batch/,
      }),
    );
    expect(
      await screen.findByText("Editor: Second workspace-sensitive batch"),
    ).toBeVisible();

    queryClient.setQueryData(telegramSystemBotKeys.connection(), {
      connected: true,
      botUsername: "system_bot",
      currentWorkspaceId: "workspace-2",
    });

    expect(await screen.findByText("Editor: Imported campaign")).toBeVisible();
    expect(apiMocks.flowStorageKey).toBe(
      "telegram-system-bot-post-batch-import:workspace-2",
    );
  });
});
