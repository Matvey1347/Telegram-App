import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { telegramChannelKeys } from "@/lib/query-keys";
import { TelegramInviteLinkCreateInline } from "./telegram-invite-link-create-inline";

const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  createInviteLink: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    sources: mocks.sources,
    createInviteLink: mocks.createInviteLink,
  },
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("TelegramInviteLinkCreateInline", () => {
  it("uses the chosen actor for the request and selector after a source refetch", async () => {
    mocks.sources.mockResolvedValue([
      {
        sourceId: "account-1",
        sourceType: "MTPROTO",
        displayName: "@creator",
        avatarUrl: "https://cdn.test/creator.jpg",
        permissions: { canManageInviteLinks: true },
      },
    ]);
    const created = {
      id: "created-link",
      telegramChannelId: "channel-1",
      name: "",
      url: "https://t.me/+created",
      creatorUsername: null,
      creatorPhotoUrl: null,
    };
    let finishRequest!: (value: typeof created) => void;
    mocks.createInviteLink.mockReturnValueOnce(
      new Promise<typeof created>((resolve) => { finishRequest = resolve; }),
    );
    const onCreated = vi.fn();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramInviteLinkCreateInline
          channelId="channel-1"
          open
          onCreated={onCreated}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Mutual promotion October"),
      {
        target: { value: "October VP" },
      },
    );
    const submit = screen.getByRole("button", { name: "Create and select" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mocks.createInviteLink).toHaveBeenCalledWith(
        "channel-1",
        expect.objectContaining({ mtprotoAccountId: "account-1" }),
      ),
    );
    act(() => client.setQueryData([...telegramChannelKeys.sources(), "channel-1"], []));
    await screen.findByText("No connected MTProto account can manage invite links for this channel.");
    await act(async () => { finishRequest(created); });

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "created-link",
          name: "October VP",
          url: "https://t.me/+created",
          creatorUsername: "creator",
          creatorPhotoUrl: "https://cdn.test/creator.jpg",
        }),
      ),
    );
  });

  it("uses discrete accessible sliders for the Telegram time and user limits", async () => {
    mocks.sources.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramInviteLinkCreateInline
          channelId="channel-1"
          open
          onCreated={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const timeSlider = screen.getByRole("slider", {
      name: "Invite link time limit",
    });
    const userSlider = screen.getByRole("slider", {
      name: "Invite link user limit",
    });

    expect(timeSlider).toHaveAttribute("aria-valuenow", "3");
    expect(userSlider).toHaveAttribute("aria-valuenow", "4");
    fireEvent.keyDown(timeSlider, { key: "ArrowLeft" });
    fireEvent.keyDown(userSlider, { key: "ArrowLeft" });

    expect(timeSlider).toHaveAttribute("aria-valuenow", "2");
    expect(userSlider).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Expiry date")).toBeVisible();
    expect(screen.getByRole("spinbutton")).toHaveValue(100);
  });
});
