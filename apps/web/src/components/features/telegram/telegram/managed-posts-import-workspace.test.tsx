import { fireEvent, render, screen } from "@testing-library/react";
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
        managedPosts={[]}
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

    fireEvent.click(screen.getByRole("checkbox", { name: "Approved" }));

    expect(onUpdateRow).toHaveBeenCalledWith(0, { approved: true });
  });
});
