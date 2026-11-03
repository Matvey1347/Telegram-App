import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrmInboxFolders } from "./crm-inbox-folders";

describe("Inbox folder navigation", () => {
  it("keeps zero badges hidden and displays the full count above 99", async () => {
    const onSelect = vi.fn();
    render(<CrmInboxFolders folders={[
      { id: "quiet", name: "Quiet", color: null, emojiPresentation: null, unreadCount: 0 },
      { id: "busy", name: "Busy", color: null, emojiPresentation: null, unreadCount: 143 },
    ]} selectedId="" totalUnread={143} loading={false} error={false} onSelect={onSelect} onRetry={vi.fn()} />);
    const quiet = screen.getByRole("button", { name: "Quiet, 0 unread messages" });
    const busy = screen.getByRole("button", { name: "Busy, 143 unread messages" });
    expect(within(quiet).queryByText("0")).not.toBeInTheDocument();
    expect(within(busy).getByText("143")).toBeInTheDocument();
    await userEvent.tab();
    await userEvent.tab();
    expect(quiet).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("quiet");
  });

  it("renders a matching folder emoji only once and preserves other names", () => {
    render(<CrmInboxFolders folders={[
      { id: "emoji", name: "📂 Archive", color: null, emojiPresentation: { type: "unicode", value: "📂" }, unreadCount: 0 },
      { id: "other", name: "📁 Projects", color: null, emojiPresentation: { type: "unicode", value: "📂" }, unreadCount: 0 },
    ]} selectedId="" totalUnread={0} loading={false} error={false} onSelect={vi.fn()} onRetry={vi.fn()} />);
    const matching = screen.getByRole("button", { name: "📂 Archive, 0 unread messages" });
    expect(matching.textContent).toBe("📂Archive");
    expect(screen.getByRole("button", { name: "📁 Projects, 0 unread messages" })).toHaveTextContent("📁 Projects");
  });

  it("reorders folders and restores the preference only for the same user and workspace", async () => {
    localStorage.clear();
    const folders = [
      { id: "a", name: "Alpha", color: null, emojiPresentation: null, unreadCount: 0 },
      { id: "b", name: "Beta", color: null, emojiPresentation: null, unreadCount: 0 },
      { id: "c", name: "Gamma", color: null, emojiPresentation: null, unreadCount: 0 },
    ];
    const props = { folders, selectedId: "", totalUnread: 0, loading: false, error: false, onSelect: vi.fn(), onRetry: vi.fn(), userId: "user-a", workspaceId: "workspace-a" };
    const view = render(<CrmInboxFolders {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Reorder" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Beta up" }));
    const names = () => within(screen.getByRole("navigation")).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names().indexOf("Beta, 0 unread messages")).toBeLessThan(names().indexOf("Alpha, 0 unread messages"));
    view.unmount();
    const restored = render(<CrmInboxFolders {...props} />);
    expect(names().indexOf("Beta, 0 unread messages")).toBeLessThan(names().indexOf("Alpha, 0 unread messages"));
    restored.rerender(<CrmInboxFolders {...props} workspaceId="workspace-b" />);
    expect(names().indexOf("Alpha, 0 unread messages")).toBeLessThan(names().indexOf("Beta, 0 unread messages"));
    restored.rerender(<CrmInboxFolders {...props} userId="user-b" />);
    expect(names().indexOf("Alpha, 0 unread messages")).toBeLessThan(names().indexOf("Beta, 0 unread messages"));
  });

  it("supports dragging a folder to another position", () => {
    const folders = ["Alpha", "Beta"].map((name) => ({ id: name, name, color: null, emojiPresentation: null, unreadCount: 0 }));
    render(<CrmInboxFolders folders={folders} selectedId="" totalUnread={0} loading={false} error={false} onSelect={vi.fn()} onRetry={vi.fn()} />);
    const alpha = screen.getByRole("button", { name: "Alpha, 0 unread messages" }).parentElement!;
    const beta = screen.getByRole("button", { name: "Beta, 0 unread messages" }).parentElement!;
    fireEvent.dragStart(beta, { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    fireEvent.dragOver(alpha);
    fireEvent.drop(alpha);
    const buttons = within(screen.getByRole("navigation")).getAllByRole("button");
    expect(buttons.indexOf(screen.getByRole("button", { name: "Beta, 0 unread messages" }))).toBeLessThan(buttons.indexOf(screen.getByRole("button", { name: "Alpha, 0 unread messages" })));
  });

  it("does not claim zero unread while the folder summary is still loading", () => {
    render(<CrmInboxFolders folders={[]} selectedId="" totalUnread={null} loading error={false} onSelect={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All chats" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("No folders")).not.toBeInTheDocument();
  });

  it("explains an empty folder list while keeping all chats available", () => {
    render(<CrmInboxFolders folders={[]} selectedId="" totalUnread={0} loading={false} error={false} onSelect={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText("No folders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All chats, 0 unread messages" })).toBeInTheDocument();
  });
});
