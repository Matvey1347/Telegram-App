import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { renderWithI18n } from "@/test/render-with-i18n";
import { ToastProvider } from "@/providers/toast-provider";
import { PostBatchEditor } from "./post-batch-editor";
import { importLocalPost } from "./post-batch-model";

const apiMocks = vi.hoisted(() => ({
  occurrences: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  telegramPublicationSchedulesApi: {
    occurrences: apiMocks.occurrences,
  },
}));

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" aria-label="Add emoji" disabled={disabled} />
  ),
}));

function renderEditor(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const batch: TelegramPostBatch = {
  id: "batch-1",
  title: "Imported posts",
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
  posts: [
    {
      id: "post-1",
      position: 0,
      title: "First post",
      iconId: null,
      iconPresentation: null,
      text: "Hello",
      imageUrls: [],
      mediaItems: [],
      buttonRows: [],
      action: "PUBLISH_NOW",
      scheduledAt: null,
      deleteAfterHours: 24,
      longTextMode: "IMAGES_THEN_TEXT",
      channelOverrides: [],
    },
  ],
};

const channels = [
  {
    id: "channel-1",
    title: "News",
    isActive: true,
    canPostMessages: true,
    publishingCapabilities: {
      source: null,
      captionLengthMax: 1024,
      messageLengthMax: 4096,
      maxUploadFileSizeMb: null,
      supportsCustomEmoji: false,
      canPublishInlineButtons: false,
      checkedAt: null,
      isFallback: true,
    },
  },
  {
    id: "channel-2",
    title: "Promos",
    isActive: true,
    canPostMessages: true,
    publishingCapabilities: {
      source: null,
      captionLengthMax: 1024,
      messageLengthMax: 4096,
      maxUploadFileSizeMb: null,
      supportsCustomEmoji: false,
      canPublishInlineButtons: false,
      checkedAt: null,
      isFallback: true,
    },
  },
];

describe("PostBatchEditor", () => {
  beforeEach(() => {
    apiMocks.occurrences.mockReset().mockResolvedValue([]);
  });
  it("shows batch-owned labels, removes long-text controls, and keeps actions below the editor", () => {
    renderEditor(
      <PostBatchEditor
        batch={batch}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.getByText("Icon")).toBeVisible();
    expect(screen.getByText("Post title")).toBeVisible();
    expect(
      screen.queryByText("telegram.posts.import.icon"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Long text mode")).not.toBeInTheDocument();
    expect(screen.getByTestId("post-batch-actions")).toHaveClass("pt-4");
    expect(screen.getByTestId("post-batch-actions")).not.toHaveClass("sticky");
    expect(screen.getByTestId("post-batch-publications")).toHaveClass(
      "lg:col-start-2",
    );
    expect(screen.getByTestId("post-batch-heading-fields")).toHaveClass(
      "md:items-end",
    );
    expect(screen.getByText("Format for all")).toBeVisible();
    expect(screen.getByText("Format")).toBeVisible();
    expect(screen.getByTestId("post-batch-identity-fields")).toHaveClass(
      "md:grid-cols-[40px_minmax(0,1fr)]",
    );
    expect(screen.getByTestId("post-batch-delivery-fields")).toHaveClass(
      "md:grid-cols-2",
    );
    expect(screen.queryByText("Media: 0")).not.toBeInTheDocument();
    expect(
      screen
        .getByText("Preview")
        .compareDocumentPosition(screen.getByText("Icon")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByTestId("post-batch-channel-overrides"),
    ).not.toBeInTheDocument();
  });

  it("starts one multiple bot import for every publication in the batch", () => {
    const onImportPostsFromBot = vi.fn();
    const twoPostBatch = {
      ...batch,
      postCount: 2,
      posts: [
        batch.posts[0],
        { ...batch.posts[0], id: "post-2", position: 1, title: "Second" },
      ],
    };
    renderEditor(
      <PostBatchEditor
        batch={twoPostBatch}
        channels={channels}
        saving={false}
        dispatching={false}
        canImportFromBot
        onSave={vi.fn()}
        onDispatch={vi.fn()}
        onImportPostsFromBot={onImportPostsFromBot}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send posts via bot" }));

    expect(onImportPostsFromBot).toHaveBeenCalledWith(["post-1", "post-2"], 2);
  });

  it("hides channel overrides when the post has only one destination", () => {
    renderEditor(
      <PostBatchEditor
        batch={batch}
        channels={[channels[0]]}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Channel overrides/)).not.toBeInTheDocument();
  });

  it("shows every channel with inherited time and its publication slots", async () => {
    const scheduledAt = new Date(2026, 8, 20, 19, 10).toISOString();
    apiMocks.occurrences.mockResolvedValue([
      {
        slotId: "last-slot",
        scheduledAt,
        title: "Last slot",
        kind: "CONTENT",
        time: "19:10",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: "AVAILABLE",
      },
    ]);
    renderEditor(
      <PostBatchEditor
        batch={{
          ...batch,
          channelIds: ["channel-1", "channel-2"],
          channelCount: 2,
          posts: [
            {
              ...batch.posts[0],
              action: "SCHEDULE",
              scheduledAt,
            },
          ],
        }}
        channels={channels.map((channel) =>
          channel.id === "channel-1"
            ? { ...channel, photoUrl: "/news.jpg" }
            : channel,
        )}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    for (const channel of channels) {
      const row = within(
        screen.getByTestId(`post-batch-channel-${channel.id}`),
      );
      expect(
        row.getByRole("button", { name: /Schedule in Telegram/ }),
      ).toBeVisible();
    }
    const firstRow = within(screen.getByTestId("post-batch-channel-channel-1"));
    expect(firstRow.getByDisplayValue("19:10")).toBeVisible();
    expect(
      await firstRow.findByRole("button", {
        name: /19:10.*Regular publication.*Last slot/i,
      }),
    ).toHaveClass("border-blue-500");
    const secondRow = within(
      screen.getByTestId("post-batch-channel-channel-2"),
    );
    expect(secondRow.queryByDisplayValue("19:10")).not.toBeInTheDocument();
    fireEvent.click(
      secondRow.getByRole("button", { name: "Toggle schedule for Promos" }),
    );
    expect(await secondRow.findByDisplayValue("19:10")).toBeVisible();
    expect(
      await secondRow.findByRole("button", {
        name: /19:10.*Regular publication.*Last slot/i,
      }),
    ).toHaveClass("border-blue-500");
    expect(
      within(screen.getByTestId("post-batch-channel-channel-1")).getByRole(
        "img",
        { name: "News" },
      ),
    ).toBeVisible();
    expect(screen.getByText("Channel overrides (2)")).toBeVisible();
  });

  it("shows schedule and ad-sale format in the publications list and applies a common format", async () => {
    const scheduledAt = new Date(2026, 8, 20, 19, 10).toISOString();
    const onDispatch = vi.fn().mockResolvedValue(undefined);
    renderEditor(
      <PostBatchEditor
        batch={{
          ...batch,
          postCount: 2,
          posts: [
            batch.posts[0],
            {
              ...batch.posts[0],
              id: "post-2",
              position: 1,
              title: "Scheduled post",
              iconPresentation: {
                type: "unicode",
                value: "🌙",
                name: "moon",
              },
              action: "SCHEDULE",
              scheduledAt,
              deleteAfterHours: 48,
            },
          ],
        }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={onDispatch}
      />,
    );

    const scheduledRow = within(
      screen.getByTestId("post-batch-publication-post-2"),
    );
    expect(scheduledRow.getByText("Scheduled post")).toBeVisible();
    expect(scheduledRow.getByText("2/48")).toBeVisible();
    expect(scheduledRow.getByText(/19:10/)).toBeVisible();
    const commonFormat = within(
      screen.getByTestId("post-batch-format-for-all"),
    );
    fireEvent.click(
      commonFormat.getByRole("button", { name: "Mixed / default" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "3/72" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() => expect(onDispatch).toHaveBeenCalledOnce());
    expect(
      onDispatch.mock.calls[0][0].posts.map(
        (post: TelegramPostBatch["posts"][number]) => post.deleteAfterHours,
      ),
    ).toEqual([72, 72]);
  });

  it("synchronizes an imported post into the editor and preview", async () => {
    function ImportedPostHarness() {
      const [current, setCurrent] = useState(batch);
      return (
        <>
          <button
            type="button"
            onClick={() =>
              setCurrent((value) =>
                importLocalPost(value, "post-1", {
                  title: "Imported title",
                  text: "Imported preview text",
                  imageUrls: [],
                  buttonRows: [],
                }),
              )
            }
          >
            Complete import
          </button>
          <PostBatchEditor
            batch={current}
            channels={channels}
            saving={false}
            dispatching={false}
            onSave={vi.fn()}
            onDispatch={vi.fn()}
            onDraftChange={setCurrent}
          />
        </>
      );
    }
    renderEditor(<ImportedPostHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Complete import" }));

    await waitFor(() =>
      expect(screen.getAllByText("Imported title").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Imported preview text").length).toBeGreaterThan(
      0,
    );
  });

  it("deletes a publication from the batch list", async () => {
    renderEditor(
      <PostBatchEditor
        batch={{
          ...batch,
          postCount: 2,
          posts: [
            batch.posts[0],
            {
              ...batch.posts[0],
              id: "post-2",
              position: 1,
              title: "Second post",
            },
          ],
        }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Second post" }));

    await waitFor(() =>
      expect(
        screen.queryByTestId("post-batch-publication-post-2"),
      ).not.toBeInTheDocument(),
    );
  });

  it("dispatches the latest edited draft", async () => {
    const onDispatch = vi.fn().mockResolvedValue(undefined);
    renderEditor(
      <PostBatchEditor
        batch={batch}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={onDispatch}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Imported posts"), {
      target: { value: "September launch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() => expect(onDispatch).toHaveBeenCalledOnce());
    expect(onDispatch.mock.calls[0][0]).toMatchObject({
      id: "batch-1",
      version: 2,
      title: "September launch",
      channelIds: ["channel-1"],
    });
  });

  it("prevents channel edits after dispatch", () => {
    renderEditor(
      <PostBatchEditor
        batch={{ ...batch, status: "ACTIVE", version: 3 }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "N News" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save and dispatch" }),
    ).not.toBeInTheDocument();
  });

  it("does not dispatch after a schedule time becomes incomplete", () => {
    const onDispatch = vi.fn();
    renderEditor(
      <PostBatchEditor
        batch={{
          ...batch,
          posts: [
            {
              ...batch.posts[0],
              action: "SCHEDULE",
              scheduledAt: null,
            },
          ],
        }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={onDispatch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    expect(onDispatch).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Add a valid date and time to every scheduled post and override.",
      ),
    ).toBeVisible();
  });

  it("shows an explicit empty selection and prunes overrides for deselected channels", async () => {
    const onDispatch = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const firstRender = renderEditor(
      <PostBatchEditor
        batch={{ ...batch, channelIds: [] }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={onDispatch}
      />,
    );

    expect(
      screen.getByRole("button", { name: "No channels selected" }),
    ).toBeVisible();

    firstRender.unmount();
    renderEditor(
      <PostBatchEditor
        key="with-overrides"
        batch={{
          ...batch,
          channelIds: ["channel-1", "channel-2"],
          posts: [
            {
              ...batch.posts[0],
              channelOverrides: [
                {
                  telegramChannelId: "channel-2",
                  action: "PUBLISH_NOW",
                  scheduledAt: null,
                },
              ],
            },
          ],
        }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={onSave}
        onDispatch={onDispatch}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "N News P Promos" }));
    fireEvent.click(screen.getByRole("button", { name: "P Promos" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() => expect(onDispatch).toHaveBeenCalledOnce());
    expect(onDispatch.mock.calls[0][0].channelIds).toEqual(["channel-1"]);
    expect(onDispatch.mock.calls[0][0].posts[0].channelOverrides).toEqual([]);
  });
});
