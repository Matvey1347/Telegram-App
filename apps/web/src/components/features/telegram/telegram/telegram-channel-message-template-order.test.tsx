import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import { TelegramChannelMessageTemplateOrder } from "./telegram-channel-message-template-order";

const channel = (
  id: string,
  title: string,
): TelegramMessageTemplateChannelSource => ({
  id,
  title,
  description: null,
  username: null,
  photoUrl: null,
  tgStatUrl: null,
  emojiSource: "📣",
  subscribersCount: null,
  iconPresentation: null,
  networkGroups: [],
  defaultInviteLinkId: null,
  inviteLinks: [],
  products: [],
});

describe("TelegramChannelMessageTemplateOrder", () => {
  it("moves channels and assigns a shared topic without changing the source list", () => {
    const onOrderChange = vi.fn();
    const onGroupChannelsChange = vi.fn();
    const onGroupModeChange = vi.fn();
    const onGroupLabelsChange = vi.fn();
    const onGroupHeaderTemplateChange = vi.fn();
    render(
      <TelegramChannelMessageTemplateOrder
        channels={[channel("first", "First"), channel("second", "Second")]}
        groupChannels={true}
        groupMode="CUSTOM"
        groupLabels={{}}
        groupHeaderTemplate="{{group}} — {{count}} channels"
        onOrderChange={onOrderChange}
        onGroupChannelsChange={onGroupChannelsChange}
        onGroupModeChange={onGroupModeChange}
        onGroupLabelsChange={onGroupLabelsChange}
        onGroupHeaderTemplateChange={onGroupHeaderTemplateChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
    expect(onOrderChange).toHaveBeenCalledWith(["second", "first"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Group for First" }), {
      target: { value: "Business" },
    });
    expect(onGroupLabelsChange).toHaveBeenCalledWith({ first: "Business" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Group channels/ }));
    expect(onGroupChannelsChange).toHaveBeenCalledWith(false);
  });

  it("shows editable groups from network names", () => {
    const onGroupLabelsChange = vi.fn();
    const business = channel("business", "Business channel");
    business.networkGroups = [{ name: "Business", emojiSource: "💼" }];
    render(
      <TelegramChannelMessageTemplateOrder
        channels={[business]}
        groupChannels={true}
        groupMode="NETWORK"
        groupLabels={{}}
        groupHeaderTemplate="{{group}} — {{count}} channels"
        onOrderChange={vi.fn()}
        onGroupChannelsChange={vi.fn()}
        onGroupModeChange={vi.fn()}
        onGroupLabelsChange={onGroupLabelsChange}
        onGroupHeaderTemplateChange={vi.fn()}
      />,
    );

    expect(screen.getByText("💼")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Group name for Business" }),
      {
        target: { value: "Commercial" },
      },
    );

    expect(onGroupLabelsChange).toHaveBeenCalledWith({
      business: "Commercial",
    });
  });

  it("moves an entire network group without splitting its channels", () => {
    const onOrderChange = vi.fn();
    const business = channel("business", "Business channel");
    const growth = channel("growth", "Growth channel");
    business.networkGroups = [{ name: "Business", emojiSource: "💼" }];
    growth.networkGroups = [{ name: "Growth", emojiSource: "📈" }];
    render(
      <TelegramChannelMessageTemplateOrder
        channels={[business, growth]}
        groupChannels={true}
        groupMode="NETWORK"
        groupLabels={{}}
        groupHeaderTemplate="{{group}} — {{count}} saved channels"
        onOrderChange={onOrderChange}
        onGroupChannelsChange={vi.fn()}
        onGroupModeChange={vi.fn()}
        onGroupLabelsChange={vi.fn()}
        onGroupHeaderTemplateChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Move Business group down" }),
    );
    expect(onOrderChange).toHaveBeenCalledWith(["growth", "business"]);
  });
});
