import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import { renderWithI18n } from "@/test/render-with-i18n";
import { PostBatchWorkspace } from "./post-batch-workspace";

vi.mock("./post-batch-editor", () => ({
  PostBatchEditor: ({
    batch,
    onDraftChange,
  }: {
    batch: TelegramPostBatch;
    onDraftChange: (value: TelegramPostBatch) => void;
  }) => (
    <input
      aria-label="Batch draft title"
      value={batch.title}
      onChange={(event) =>
        onDraftChange({ ...batch, title: event.target.value })
      }
    />
  ),
}));

const batch: TelegramPostBatch = {
  id: "batch-autosave-1",
  title: "Original batch",
  status: "DRAFT",
  version: 0,
  postCount: 1,
  channelCount: 1,
  deliveryCount: 0,
  scheduledCount: 0,
  publishedCount: 0,
  failedCount: 0,
  nextPublicationAt: null,
  nextDeleteAt: null,
  createdAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  channelIds: ["channel-1"],
  defaultDeleteAfterHours: 24,
  posts: [
    {
      id: "post-1",
      position: 0,
      title: "Post 1",
      iconId: null,
      iconPresentation: null,
      text: null,
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

const props = {
  batch,
  channels: [],
  saving: false,
  dispatching: false,
  onSave: vi.fn(),
  onDispatch: vi.fn(),
  onAddPost: vi.fn(),
};

describe("PostBatchWorkspace", () => {
  it("opens the persisted server draft directly in the editor", () => {
    renderWithI18n(<PostBatchWorkspace {...props} />);
    expect(screen.getByDisplayValue("Original batch")).toBeVisible();
  });
});
