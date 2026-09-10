import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionInviteLinksModal } from "./mutual-promotion-invite-links-modal";

const mocks = vi.hoisted(() => ({
  importInviteLink: vi.fn(),
  inviteLinkOptions: vi.fn(),
}));

vi.mock("@/lib/features/growth/mutual-promotion-folders-api", () => ({
  mutualPromotionFoldersApi: {
    inviteLinkOptions: mocks.inviteLinkOptions,
    importInviteLink: mocks.importInviteLink,
  },
}));

const folder = {
  id: "folder-1",
  status: "ACTIVE",
  startsAt: "2026-09-08T08:00:00.000Z",
  endsAt: "2026-09-10T08:00:00.000Z",
  participants: [
    {
      id: "participant-1",
      telegramChannelId: "channel-1",
      inviteLinkMode: "REUSABLE",
      channel: { id: "channel-1", title: "Publisher", photoUrl: null },
      inviteLink: {
        id: "old-link",
        name: "Wrong link",
        url: "https://t.me/+wrong",
      },
    },
  ],
} as never;

function renderModal(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  return {
    onSubmit,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <MutualPromotionInviteLinksModal
          open
          folder={folder}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("MutualPromotionInviteLinksModal", () => {
  it("replaces the selected link without exposing structural folder fields", async () => {
    mocks.inviteLinkOptions.mockResolvedValue([
      {
        id: "old-link",
        telegramChannelId: "channel-1",
        name: "Wrong link",
        url: "https://t.me/+wrong",
        available: true,
      },
      {
        id: "correct-link",
        telegramChannelId: "channel-1",
        name: "Correct link",
        url: "https://t.me/+correct",
        available: true,
      },
    ]);
    const { onSubmit } = renderModal();

    expect(screen.queryByLabelText("Folder title")).not.toBeInTheDocument();
    expect(
      screen.getByText(/restarts attribution for that channel/),
    ).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: /Wrong link/ }));
    fireEvent.click(screen.getByRole("button", { name: /Correct link/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save invite links" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        participants: [
          {
            participantId: "participant-1",
            inviteLinkId: "correct-link",
            inviteLinkMode: "REUSABLE",
          },
        ],
      }),
    );
  });

  it("verifies a pasted Telegram link, selects it, and renders the creator emoji", async () => {
    mocks.inviteLinkOptions.mockResolvedValue([
      {
        id: "old-link",
        telegramChannelId: "channel-1",
        name: "Wrong link",
        url: "https://t.me/+wrong",
        available: true,
      },
    ]);
    mocks.importInviteLink.mockResolvedValue({
      id: "verified-link",
      telegramChannelId: "channel-1",
      name: "Legacy owner link",
      url: "https://t.me/+Kjb_VF-LyV800WYy",
      joinedCount: 3,
      requestedCount: 0,
      isRevoked: false,
      available: true,
      unavailableReason: null,
      creatorUsername: null,
      creatorFirstName: "Owner",
      creatorPhotoUrl: null,
      creatorMember: {
        id: "member-1",
        name: "Owner",
        avatarPresentation: { type: "unicode", value: "😇" },
      },
    });
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /Wrong link/ }));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "https://t.me/+Kjb_VF-LyV800WYy" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Verify and add this invite link/,
      }),
    );

    await waitFor(() =>
      expect(mocks.importInviteLink).toHaveBeenCalledWith({
        telegramChannelId: "channel-1",
        url: "https://t.me/+Kjb_VF-LyV800WYy",
        folderId: "folder-1",
        startsAt: "2026-09-08T08:00:00.000Z",
        endsAt: "2026-09-10T08:00:00.000Z",
      }),
    );
    expect(
      await screen.findByRole("button", { name: /Legacy owner link/ }),
    ).toBeVisible();
    expect(screen.getByText("😇")).toBeVisible();
  });

  it("offers server verification for pasted text instead of hiding the action", async () => {
    mocks.inviteLinkOptions.mockResolvedValue([
      {
        id: "old-link",
        telegramChannelId: "channel-1",
        name: "Wrong link",
        url: "https://t.me/+wrong",
        available: true,
      },
    ]);
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /Wrong link/ }));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "+legacyHash" },
    });

    expect(
      screen.getByRole("button", {
        name: "Verify and add this invite link",
      }),
    ).toBeVisible();
    expect(screen.queryByText("No options found")).not.toBeInTheDocument();
  });

  it("refreshes the links already selected by the folder", async () => {
    mocks.inviteLinkOptions.mockResolvedValue([
      {
        id: "old-link",
        telegramChannelId: "channel-1",
        name: "Wrong link",
        url: "https://t.me/+wrong",
        available: true,
      },
    ]);
    mocks.importInviteLink.mockResolvedValue({
      id: "old-link",
      telegramChannelId: "channel-1",
      name: "Wrong link",
      url: "https://t.me/+wrong",
      joinedCount: 86,
      requestedCount: 0,
      isRevoked: false,
      available: true,
      unavailableReason: null,
      creatorUsername: "okane_taikin",
      creatorFirstName: "😇",
      creatorPhotoUrl: null,
      creatorMember: null,
    });
    renderModal();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh selected links from Telegram",
      }),
    );

    await waitFor(() =>
      expect(mocks.importInviteLink).toHaveBeenCalledWith({
        telegramChannelId: "channel-1",
        url: "https://t.me/+wrong",
        folderId: "folder-1",
        startsAt: "2026-09-08T08:00:00.000Z",
        endsAt: "2026-09-10T08:00:00.000Z",
      }),
    );
  });
});
