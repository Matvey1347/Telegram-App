import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefreshCw } from "lucide-react";
import {
  ChannelActionsMenu,
  ChannelMenuAction,
  ChannelMenuLink,
} from "./channel-card-actions";

describe("ChannelActionsMenu", () => {
  it("keeps channel operations behind one accessible overflow menu", async () => {
    const sync = vi.fn();
    render(
      <ChannelActionsMenu
        channel={{ id: "channel-1", title: "Freudzone" } as never}
        archived={false}
        canArchive
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      >
        <ChannelMenuLink
          label="Open channel"
          href="/telegram/channels/channel-1"
          icon={<RefreshCw size={17} />}
        />
        <ChannelMenuAction
          label="Sync channel"
          icon={<RefreshCw size={17} />}
          onClick={sync}
        />
        <ChannelMenuLink
          label="Posts"
          href="/telegram/posts"
          icon={<RefreshCw size={17} />}
        />
        <ChannelMenuAction
          label="Sources"
          icon={<RefreshCw size={17} />}
          onClick={vi.fn()}
        />
      </ChannelActionsMenu>,
    );

    expect(screen.queryByText("Sync channel")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Freudzone" }),
    );
    expect(screen.getByText("Sync channel")).toBeInTheDocument();
    expect(screen.getByText("Edit economics")).toBeInTheDocument();
    expect(screen.getByText("Bot connection")).toBeInTheDocument();
    expect(screen.getByText("Archive channel")).toBeInTheDocument();
    expect(screen.getByText("Delete channel")).toBeInTheDocument();
    const menu = screen.getByRole("menu");
    expect(menu.querySelector("a,button")).toHaveTextContent("Open channel");
    expect(menu).toHaveClass("fixed");
    expect(menu.parentElement).toBe(document.body);
    const labels = Array.from(menu.querySelectorAll("a,button")).map((item) =>
      item.textContent?.trim(),
    );
    expect(labels.indexOf("Edit economics")).toBe(labels.indexOf("Posts") + 1);
    expect(labels.indexOf("Edit economics")).toBeLessThan(
      labels.indexOf("Sources"),
    );

    await userEvent.click(screen.getByText("Sync channel"));
    expect(sync).toHaveBeenCalledOnce();
    expect(screen.queryByText("Sync channel")).not.toBeInTheDocument();
  });
});
