import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Account, TelegramChannel } from "@/lib/api";
import { MutualPromotionParticipantsEditor } from "./mutual-promotion-participants-editor";

const channel = {
  id: "channel-1",
  title: "Publisher One",
} as TelegramChannel;

describe("MutualPromotionParticipantsEditor", () => {
  it("adds channels from the multi-select and defaults them to publisher", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MutualPromotionParticipantsEditor
        channels={[channel]}
        accounts={[] as Account[]}
        participants={[]}
        inviteLinks={[]}
        inviteLinksLoading={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select channels" }));
    fireEvent.click(screen.getByRole("button", { name: /Publisher One/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ channelId: "channel-1", role: "PUBLISHER" }),
    ]);

    rerender(
      <MutualPromotionParticipantsEditor
        channels={[channel]}
        accounts={[] as Account[]}
        participants={[
          {
            channelId: "channel-1",
            role: "PUBLISHER",
            inviteLinkId: "link-1",
            inviteLinkMode: "FOLDER_ONLY",
            accountId: "",
            amount: "",
          },
        ]}
        inviteLinks={[]}
        inviteLinksLoading={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "📣 Publisher" }));
    fireEvent.click(screen.getByRole("button", { name: "💳 Paid" }));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ channelId: "channel-1", role: "PAID" }),
    ]);
  });

  it("removes a selected channel through the multi-select", () => {
    const onChange = vi.fn();
    render(
      <MutualPromotionParticipantsEditor
        channels={[channel]}
        accounts={[] as Account[]}
        participants={[
          {
            channelId: "channel-1",
            role: "PUBLISHER",
            inviteLinkId: "link-1",
            inviteLinkMode: "REUSABLE",
            accountId: "",
            amount: "",
          },
        ]}
        inviteLinks={[]}
        inviteLinksLoading={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Publisher One/ }));
    const channelButtons = screen.getAllByRole("button", {
      name: /Publisher One/,
    });
    fireEvent.click(channelButtons[channelButtons.length - 1]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows the invite-link creator avatar like the ad-campaign selector", () => {
    render(
      <MutualPromotionParticipantsEditor
        channels={[channel]}
        accounts={[] as Account[]}
        participants={[
          {
            channelId: "channel-1",
            role: "PUBLISHER",
            inviteLinkId: "",
            inviteLinkMode: "FOLDER_ONLY",
            accountId: "",
            amount: "",
          },
        ]}
        inviteLinks={[
          {
            id: "link-1",
            telegramChannelId: "channel-1",
            name: "Imported MTProto link",
            url: "https://t.me/+example",
            joinedCount: 0,
            requestedCount: 0,
            isRevoked: false,
            available: true,
            unavailableReason: null,
            creatorUsername: "creator",
            creatorFirstName: "Creator",
            creatorPhotoUrl: null,
            creatorMember: {
              id: "member-1",
              name: "Creator",
              avatarPresentation: {
                type: "image",
                id: "icon-1",
                url: "https://example.com/creator.jpg",
                name: "Creator avatar",
              },
            },
          },
        ]}
        inviteLinksLoading={false}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select link" }));

    expect(screen.getByAltText("Creator")).toHaveAttribute(
      "src",
      "https://example.com/creator.jpg",
    );
  });

  it("shows paid fields at the side and renders finance account avatars", () => {
    render(
      <MutualPromotionParticipantsEditor
        channels={[channel]}
        accounts={[
          {
            id: "account-1",
            name: "Poland Card",
            currency: "PLN",
            iconPresentation: {
              type: "image",
              id: "account-icon",
              url: "https://example.com/account.jpg",
              name: "Account avatar",
            },
          } as Account,
        ]}
        participants={[
          {
            channelId: "channel-1",
            role: "PAID",
            inviteLinkId: "",
            inviteLinkMode: "REUSABLE",
            accountId: "",
            amount: "",
          },
        ]}
        inviteLinks={[]}
        inviteLinksLoading={false}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Paid participation details",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "♻️ Reusable for folders" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add later" }));
    expect(
      screen.getByRole("button", { name: /Poland Card PLN/ }),
    ).toContainHTML("https://example.com/account.jpg");
  });
});
