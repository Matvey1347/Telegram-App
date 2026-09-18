import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { ManagedPostsImportWorkspace } from "./managed-posts-import-workspace";
import { rowToEditable } from "./managed-posts-import-model";

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <button type="button">Add emoji</button>,
}));

vi.mock("./telegram-text-editor", () => ({
  TelegramTextEditor: () => <textarea aria-label="Telegram text editor" />,
}));

vi.mock("./telegram-post-preview", () => ({
  TelegramPostPreview: () => <div>Post preview</div>,
}));

vi.mock("./managed-post-internal-links-notice", () => ({
  buildManagedPostInternalLinks: () => [],
  ManagedPostInternalLinksNotice: () => null,
}));

vi.mock("./publication-slot-occurrence-select", () => ({
  PublicationSlotOptions: ({
    onChange,
  }: {
    onChange: (value: { slotId: string; scheduledAt: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ slotId: "slot-1", scheduledAt: "2026-09-20T09:00:00.000Z" })
      }
    >
      Available slot
    </button>
  ),
}));

describe("ManagedPostsImportWorkspace", () => {
  it("keeps Approved editable beside Imported", () => {
    const onUpdateRow = vi.fn();
    const row = rowToEditable({
      title: "Post",
      approved: false,
      imageSearch: ["carpathian trail mood"],
    });

    render(
      <ManagedPostsImportWorkspace
        rows={[row]}
        visibleRowIndices={[0]}
        selectedRowIndex={0}
        activeTab="new"
        tabCounts={{ new: 1, imported: 0 }}
        disabled={false}
        channelId="channel-1"
        captionLengthMax={1024}
        messageLengthMax={4096}
        referencedPosts={[]}
        groupOptions={[]}
        onUpdateRow={onUpdateRow}
        onDeleteRow={vi.fn()}
        onSelectRow={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Approved" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Imported" })).toBeVisible();
    expect(
      screen
        .getByRole("checkbox", { name: "Approved" })
        .compareDocumentPosition(screen.getByDisplayValue("Post")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /carpathian trail mood/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("managed-post-import-identity-fields"),
    ).toHaveClass("sm:grid-cols-[36px_minmax(0,1fr)]");

    fireEvent.click(screen.getByRole("checkbox", { name: "Approved" }));

    expect(onUpdateRow).toHaveBeenCalledWith(0, { approved: true });
  });

  it("shows the selected operation beside preview and exposes schedule slots", () => {
    const onScheduleChange = vi.fn();
    const row = rowToEditable({
      title: "Post",
      scheduledAt: "2026-09-19T09:00:00.000Z",
    });

    render(
      <ManagedPostsImportWorkspace
        rows={[row]}
        visibleRowIndices={[0]}
        selectedRowIndex={0}
        activeTab="new"
        tabCounts={{ new: 1, imported: 0 }}
        disabled={false}
        channelId="channel-1"
        captionLengthMax={1024}
        messageLengthMax={4096}
        referencedPosts={[]}
        groupOptions={[]}
        selectedRowAdornment={<span>UPDATE</span>}
        scheduleValue={{
          slotId: "slot-old",
          scheduledAt: "2026-09-19T09:00:00.000Z",
        }}
        onUpdateRow={vi.fn()}
        onDeleteRow={vi.fn()}
        onSelectRow={vi.fn()}
        onSelectTab={vi.fn()}
        onScheduleChange={onScheduleChange}
      />,
    );

    expect(screen.getByText("UPDATE")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Available slot" }));
    expect(onScheduleChange).toHaveBeenCalledWith(0, {
      slotId: "slot-1",
      scheduledAt: "2026-09-20T09:00:00.000Z",
    });
  });
});
