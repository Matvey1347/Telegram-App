import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { renderWithI18n } from "@/test/render-with-i18n";
import { PostBatchEditor } from "./post-batch-editor";
import { localScheduleParts } from "./post-batch-model";

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
  associations: [],
  posts: [
    {
      id: "post-1",
      position: 0,
      title: "First post",
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
    renderWithI18n(
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
    renderWithI18n(
      <PostBatchEditor
        batch={{ ...batch, status: "ACTIVE", version: 3 }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "1 selected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("does not dispatch after a schedule time becomes incomplete", () => {
    const onDispatch = vi.fn();
    const scheduledAt = "2099-09-14T10:30:00.000Z";
    const localTime = localScheduleParts(scheduledAt).time;
    renderWithI18n(
      <PostBatchEditor
        batch={{
          ...batch,
          posts: [
            {
              ...batch.posts[0],
              action: "SCHEDULE",
              scheduledAt,
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

    fireEvent.change(screen.getByDisplayValue(localTime), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and dispatch" }));

    expect(onDispatch).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Add a valid date and time to every scheduled post and override.",
      ),
    ).toBeVisible();
  });

  it("shows an explicit empty selection and prunes overrides for deselected channels", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderWithI18n(
      <PostBatchEditor
        batch={{ ...batch, channelIds: [] }}
        channels={channels}
        saving={false}
        dispatching={false}
        onSave={onSave}
        onDispatch={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "No channels selected" }),
    ).toBeVisible();

    rerender(
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
        onDispatch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2 selected" }));
    fireEvent.click(screen.getByRole("button", { name: /Promos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].channelIds).toEqual(["channel-1"]);
    expect(onSave.mock.calls[0][0].posts[0].channelOverrides).toEqual([]);
  });
});
