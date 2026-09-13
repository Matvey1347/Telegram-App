import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelSettingsDraft } from "./channel-settings-draft";
import { ChannelPresentationSettingsModal } from "./channel-presentation-settings-modal";

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
    }: {
      onCreateOption: (value: string) => Promise<void>;
    }) => (
      <button
        type="button"
        onClick={async () => {
          try {
            await onCreateOption("https://t.me/+new-link");
          } catch {
            // The mutation owns the visible error state.
          }
        }}
      >
        Register invite link
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

function renderModal(onRegisterPendingChange = vi.fn()) {
  const channel = { id: "channel-1", title: "Business" } as never;
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
      screen.getByRole("button", { name: "Register invite link" }),
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
      screen.getByRole("button", { name: "Register invite link" }),
    );

    await waitFor(() => expect(mocks.fail).toHaveBeenCalledOnce());
    expect(mocks.fail).toHaveBeenCalledWith({
      message: "The invite link could not be verified with Telegram.",
    });
    expect(pending).toHaveBeenLastCalledWith(false);
  });
});
