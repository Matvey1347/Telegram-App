import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelSettingsDraft } from "./channel-settings-draft";
import {
  ChannelPresentationSettingsModal,
  selectPrimaryInviteLink,
} from "./channel-presentation-settings-modal";

const mocks = vi.hoisted(() => ({
  registerInviteLink: vi.fn(),
  getAllInviteLinks: vi.fn(),
  getInitialInviteLink: vi.fn(),
  startOperation: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAllTelegramChannelInviteLinks: mocks.getAllInviteLinks,
    getTelegramChannelInitialInviteLink: mocks.getInitialInviteLink,
    telegramChannelsApi: {
      ...actual.telegramChannelsApi,
      registerInviteLink: mocks.registerInviteLink,
    },
  };
});
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <button type="button">Choose emoji</button>,
}));
vi.mock("@/components/ui/primitives", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/primitives")>();
  return {
    ...actual,
    CustomSelect: ({
      onCreateOption,
      onOpen,
      placeholder,
    }: {
      onCreateOption?: (value: string) => Promise<void>;
      onOpen?: () => void;
      placeholder?: string;
    }) => (
      <button
        type="button"
        aria-label={!onCreateOption ? placeholder : undefined}
        onClick={async () => {
          onOpen?.();
          if (!onCreateOption) return;
          try {
            await onCreateOption("https://t.me/+new-link");
          } catch {
            // The mutation owns the visible error state.
          }
        }}
      >
        {onCreateOption ? "Register invite link" : placeholder}
      </button>
    ),
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    pushToast: vi.fn(),
    startOperation: mocks.startOperation,
  }),
}));

function renderModal(
  onRegisterPendingChange = vi.fn(),
  channel = { id: "channel-1", title: "Business" } as never,
) {
  const onDraftChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ChannelPresentationSettingsModal
        channel={channel}
        onClose={vi.fn()}
        embedded
        draft={createChannelSettingsDraft(channel)}
        onDraftChange={onDraftChange}
        onRegisterPendingChange={onRegisterPendingChange}
      />
    </QueryClientProvider>,
  );
  return { onDraftChange };
}

describe("ChannelPresentationSettingsModal", () => {
  beforeEach(() => {
    mocks.registerInviteLink.mockReset();
    mocks.getAllInviteLinks.mockReset().mockResolvedValue([]);
    mocks.getInitialInviteLink.mockReset().mockResolvedValue([]);
    mocks.startOperation.mockReset().mockReturnValue({
      succeed: mocks.succeed,
      fail: mocks.fail,
    });
    mocks.succeed.mockReset();
    mocks.fail.mockReset();
  });

  it("edits the short channel description in Appearance", () => {
    const { onDraftChange } = renderModal();

    fireEvent.change(
      screen.getByPlaceholderText(
        "A short description shown in generated channel lists",
      ),
      { target: { value: "A concise business channel" } },
    );

    expect(onDraftChange).toHaveBeenCalledWith({
      description: "A concise business channel",
    });
    expect(
      screen.getByPlaceholderText(
        "A short description shown in generated channel lists",
      ).tagName,
    ).toBe("TEXTAREA");
    expect(screen.getByText("Invite link for Folders")).toBeInTheDocument();
    expect(screen.getByText("Invite link for bot")).toBeInTheDocument();
    expect(screen.getByText("Invite link for newsletter")).toBeInTheDocument();
    expect(
      screen.getByText("Invite link for audience transfer"),
    ).toBeInTheDocument();
  });

  it("keeps legacy purpose links when a new primary link is chosen", () => {
    expect(
      selectPrimaryInviteLink(["old-folder", "older-folder"], "new-folder"),
    ).toEqual(["new-folder", "old-folder", "older-folder"]);
    expect(selectPrimaryInviteLink(["old-folder"], "")).toEqual([]);
  });

  it("hydrates saved invite-link purposes when the channel card is compact", async () => {
    mocks.getInitialInviteLink.mockResolvedValue([
      {
        id: "link-main",
        name: "Main",
        url: "https://t.me/+main",
        isDefaultForChannel: true,
      },
      {
        id: "link-bot",
        name: "Bot",
        url: "https://t.me/+bot",
        isDefaultForBot: true,
      },
      {
        id: "link-folder",
        name: "Folder",
        url: "https://t.me/+folder",
        isDefaultForFolders: true,
      },
      {
        id: "link-broadcast",
        name: "Broadcast",
        url: "https://t.me/+broadcast",
        isDefaultForBroadcast: true,
      },
      {
        id: "link-transfer",
        name: "Audience transfer",
        url: "https://t.me/+transfer",
        isDefaultForAudienceTransfer: true,
      },
      {
        id: "link-vp",
        name: "VP",
        url: "https://t.me/+vp",
        isDefaultForMutualPromotion: true,
      },
    ]);

    const { onDraftChange } = renderModal();

    await waitFor(() =>
      expect(onDraftChange).toHaveBeenCalledWith({
        defaultInviteLinkId: "link-main",
        botInviteLinkId: "link-bot",
        broadcastInviteLinkId: "link-broadcast",
        audienceTransferInviteLinkId: "link-transfer",
        folderDefaultInviteLinkIds: ["link-folder"],
        mutualPromotionInviteLinkIds: ["link-vp"],
      }),
    );
    expect(mocks.getInitialInviteLink).toHaveBeenCalledWith(
      "channel-1",
      undefined,
      [],
    );
    expect(mocks.getAllInviteLinks).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Select bot link" }),
    );
    await waitFor(() =>
      expect(mocks.getAllInviteLinks).toHaveBeenCalledWith("channel-1"),
    );
  });

  it("keeps a loading alert until invite-link registration succeeds", async () => {
    let resolveRegistration!: (value: { id: string }) => void;
    mocks.registerInviteLink.mockReturnValue(
      new Promise((resolve) => {
        resolveRegistration = resolve;
      }),
    );
    const pending = vi.fn();
    const { onDraftChange } = renderModal(pending);

    await userEvent.click(
      screen.getAllByRole("button", { name: "Register invite link" })[0],
    );
    expect(pending).toHaveBeenCalledWith(true);
    expect(mocks.startOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Verifying and adding the invite link…",
      }),
    );
    expect(mocks.succeed).not.toHaveBeenCalled();

    resolveRegistration({ id: "invite-1" });
    await waitFor(() => expect(mocks.succeed).toHaveBeenCalledOnce());
    expect(onDraftChange).toHaveBeenCalledWith({
      defaultInviteLinkId: "invite-1",
    });
    expect(pending).toHaveBeenLastCalledWith(false);
  });

  it("changes the loading alert to an error when registration fails", async () => {
    mocks.registerInviteLink.mockRejectedValue(new Error("Telegram failed"));
    const pending = vi.fn();
    renderModal(pending);

    await userEvent.click(
      screen.getAllByRole("button", { name: "Register invite link" })[0],
    );

    await waitFor(() => expect(mocks.fail).toHaveBeenCalledOnce());
    expect(mocks.fail).toHaveBeenCalledWith({
      message: "The invite link could not be verified with Telegram.",
    });
    expect(pending).toHaveBeenLastCalledWith(false);
  });
});
