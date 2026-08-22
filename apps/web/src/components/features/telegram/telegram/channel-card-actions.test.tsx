import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefreshCw } from "lucide-react";
import { ChannelActionsMenu, ChannelMenuAction } from "./channel-card-actions";

describe("ChannelActionsMenu", () => {
  it("keeps channel operations behind one accessible overflow menu", async () => {
    const sync = vi.fn();
    render(
      <ChannelActionsMenu
        channelTitle="Freudzone"
        archived={false}
        canArchive
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      >
        <ChannelMenuAction
          label="Sync channel"
          icon={<RefreshCw size={17} />}
          onClick={sync}
        />
      </ChannelActionsMenu>,
    );

    expect(screen.queryByText("Sync channel")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Freudzone" }),
    );
    expect(screen.getByText("Sync channel")).toBeInTheDocument();
    expect(screen.getByText("Archive channel")).toBeInTheDocument();
    expect(screen.getByText("Delete channel")).toBeInTheDocument();
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("fixed");
    expect(menu.parentElement).toBe(document.body);

    await userEvent.click(screen.getByText("Sync channel"));
    expect(sync).toHaveBeenCalledOnce();
    expect(screen.queryByText("Sync channel")).not.toBeInTheDocument();
  });
});
