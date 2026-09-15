import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { PostFromBotModal } from "./post-from-bot-modal";

const apiMocks = vi.hoisted(() => ({
  connection: vi.fn(),
  networks: vi.fn().mockResolvedValue([]),
  list: vi.fn(),
  detail: vi.fn(),
  createAndDispatch: vi.fn(),
  prepareImport: vi.fn().mockResolvedValue({ workflowId: "workflow-1" }),
  importResult: vi.fn().mockResolvedValue({ ready: false }),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelNetworksApi: { list: apiMocks.networks },
  telegramSystemBotApi: { connection: apiMocks.connection },
}));

vi.mock("@/lib/features/telegram/telegram-post-batches-api", () => ({
  telegramPostBatchesApi: apiMocks,
}));

vi.mock("@/hooks/use-telegram-system-bot-post-flow", () => ({
  useTelegramSystemBotPostFlow: () => ({
    importStatus: "idle",
    error: "",
    checkImport: vi.fn(),
    startImport: vi.fn(),
  }),
}));

vi.mock("./post-batch-editor", () => ({
  PostBatchEditor: ({
    batch,
    onDispatch,
    onDraftChange,
  }: {
    batch: TelegramPostBatch;
    onDispatch: (batch: TelegramPostBatch) => Promise<void>;
    onDraftChange?: (batch: TelegramPostBatch) => void;
  }) => (
    <div>
      <span>Editor: {batch.title}</span>
      <button
        type="button"
        onClick={() =>
          onDraftChange?.({ ...batch, title: "Locally saved campaign" })
        }
      >
        Edit local title
      </button>
      <button
        type="button"
        onClick={() => void onDispatch(batch).catch(() => undefined)}
      >
        Save and dispatch
      </button>
    </div>
  ),
}));

vi.mock("./post-batch-deliveries", () => ({
  PostBatchDeliveries: () => null,
}));

function renderModal(defaultChannelId = "channel-1") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TestI18nProvider>
        <PostFromBotModal
          open
          channels={[]}
          defaultChannelId={defaultChannelId}
          onClose={vi.fn()}
        />
      </TestI18nProvider>
    </QueryClientProvider>,
  );
}

async function createLocalDraft() {
  const button = await screen.findByRole("button", { name: "Create new" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("PostFromBotModal local drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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

  it("opens a clean local editor without creating a backend batch", async () => {
    renderModal();

    await createLocalDraft();

    expect(await screen.findByText(/Editor: Mass publication/)).toBeVisible();
    expect(apiMocks.createAndDispatch).not.toHaveBeenCalled();
  });

  it("restores edited values from the workspace-local draft", async () => {
    renderModal();
    await createLocalDraft();
    fireEvent.click(screen.getByRole("button", { name: "Edit local title" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Back to mass publications" }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit draft Locally saved campaign",
      }),
    );

    expect(
      await screen.findByText("Editor: Locally saved campaign"),
    ).toBeVisible();
    expect(apiMocks.createAndDispatch).not.toHaveBeenCalled();
  });

  it("creates the server batch only from Save and dispatch", async () => {
    const now = new Date().toISOString();
    const activeBatch = {
      id: "batch-1",
      title: "Published campaign",
      status: "ACTIVE",
      version: 1,
      postCount: 1,
      channelCount: 1,
      deliveryCount: 1,
      scheduledCount: 1,
      publishedCount: 0,
      failedCount: 0,
      nextPublicationAt: null,
      nextDeleteAt: null,
      createdAt: now,
      updatedAt: now,
      channelIds: ["channel-1"],
      defaultDeleteAfterHours: 24,
      posts: [],
    } satisfies TelegramPostBatch;
    apiMocks.createAndDispatch.mockResolvedValue({
      batch: activeBatch,
      queuedDeliveries: 1,
      alreadyQueued: false,
    });
    apiMocks.detail.mockResolvedValue(activeBatch);
    renderModal();
    await createLocalDraft();

    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() =>
      expect(apiMocks.createAndDispatch).toHaveBeenCalledOnce(),
    );
    expect(apiMocks.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        channelIds: ["channel-1"],
        posts: [expect.not.objectContaining({ id: expect.anything() })],
      }),
    );
  });
});
