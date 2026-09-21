import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import { TelegramChannelMessageTemplateOrder } from "./telegram-channel-message-template-order";

const channel = (id: string, title: string): TelegramMessageTemplateChannelSource => ({
  id, title, description: null, username: null, photoUrl: null,
  tgStatUrl: null, emojiSource: "📣", iconPresentation: null,
  defaultInviteLinkId: null, inviteLinks: [], products: [],
});

describe("TelegramChannelMessageTemplateOrder", () => {
  it("moves channels and assigns a shared topic without changing the source list", () => {
    const onOrderChange = vi.fn();
    const onGroupChannelsChange = vi.fn();
    const onGroupLabelsChange = vi.fn();
    render(
      <TelegramChannelMessageTemplateOrder
        channels={[channel("first", "First"), channel("second", "Second")]}
        groupChannels={true}
        groupLabels={{}}
        onOrderChange={onOrderChange}
        onGroupChannelsChange={onGroupChannelsChange}
        onGroupLabelsChange={onGroupLabelsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
    expect(onOrderChange).toHaveBeenCalledWith(["second", "first"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Group for First" }), { target: { value: "Business" } });
    expect(onGroupLabelsChange).toHaveBeenCalledWith({ first: "Business" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Group channels by topic/ }));
    expect(onGroupChannelsChange).toHaveBeenCalledWith(false);
  });
});
