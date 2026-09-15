import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { renderWithI18n } from "@/test/render-with-i18n";
import { ToastProvider } from "@/providers/toast-provider";
import { PostBatchEditor } from "./post-batch-editor";

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
    fireEvent.click(
      screen.getByRole("button", { name: "N News P Promos" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "P Promos" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    await waitFor(() => expect(onDispatch).toHaveBeenCalledOnce());
    expect(onDispatch.mock.calls[0][0].channelIds).toEqual(["channel-1"]);
    expect(onDispatch.mock.calls[0][0].posts[0].channelOverrides).toEqual([]);
  });
});
