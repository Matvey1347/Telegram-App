import { render, screen, within } from "@testing-library/react";
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
