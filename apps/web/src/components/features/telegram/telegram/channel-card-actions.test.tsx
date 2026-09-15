import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefreshCw } from "lucide-react";
import {
  ChannelActionsMenu,
  ChannelMenuAction,
  ChannelMenuLink,
} from "./channel-card-actions";

vi.mock("./channel-settings-modal", () => ({
  ChannelSettingsModal: ({ channel }: { channel: { title: string } }) => (
    <div role="dialog">Settings for {channel.title}</div>
  ),
}));

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
    expect(
      screen.getByRole("button", {
        name: "Channel setup 0%. Open settings",
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Freudzone" }),
    );
    expect(screen.getByText("Sync channel")).toBeInTheDocument();
    const settingsAction = screen.getByText("Settings").closest("button");
    expect(settingsAction).toBeInTheDocument();
    expect(settingsAction?.querySelector(".lucide-settings")).not.toBeNull();
    expect(screen.queryByText("Edit economics")).not.toBeInTheDocument();
    expect(screen.queryByText("Channel appearance")).not.toBeInTheDocument();
    expect(screen.queryByText("Bot connection")).not.toBeInTheDocument();
    expect(screen.getByText("Archive channel")).toBeInTheDocument();
    expect(screen.getByText("Delete channel")).toBeInTheDocument();
    const menu = screen.getByRole("menu");
    expect(menu.querySelector("a,button")).toHaveTextContent("Open channel");
    expect(menu).toHaveClass("fixed");
    expect(menu.parentElement).toBe(document.body);
    const labels = Array.from(menu.querySelectorAll("a,button")).map((item) =>
      item.textContent?.trim(),
    );
    expect(labels.indexOf("Settings")).toBe(labels.indexOf("Posts") + 1);
    expect(labels.indexOf("Settings")).toBeLessThan(labels.indexOf("Sources"));

    await userEvent.click(screen.getByText("Sync channel"));
    expect(sync).toHaveBeenCalledOnce();
    expect(screen.queryByText("Sync channel")).not.toBeInTheDocument();
  });

  it("opens channel settings from the setup indicator", async () => {
    render(
      <ChannelActionsMenu
        channel={
          {
            id: "channel-1",
            title: "Complete channel",
            presentationIconId: "icon-1",
            description: "Short description",
            tgStatUrl: "https://tgstat.com/channel/1",
            defaultInviteLinkId: "invite-1",
            botInviteLinkId: "invite-bot",
            folderDefaultInviteLinkIds: ["invite-folder"],
            mutualPromotionInviteLinkIds: ["invite-vp"],
            adBaseCpm: 100,
            targetCpa: 10,
            stopCpaFrom: 20,
            seedDisabled: true,
            preview: {
              hasPublicationSchedule: true,
              sourcesCount: 1,
              systemBotConnection: { connected: true },
            },
          } as never
        }
        archived={false}
        canArchive
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      >
        {null}
      </ChannelActionsMenu>,
    );

    const indicator = screen.getByRole("button", {
      name: "Channel setup 100%. Open settings",
    });
    expect(indicator.querySelector(".lucide-check")).not.toBeNull();

    await userEvent.click(indicator);

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Settings for Complete channel",
    );
  });
});
