import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChannelSystemBotAccessModal,
  ChannelSystemBotBadge,
} from "./channel-system-bot-access-modal";

const { checkSystemBotAccess } = vi.hoisted(() => ({
  checkSystemBotAccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { checkSystemBotAccess },
}));

function renderModal(
  status: "CONNECTED" | "UNVERIFIED" | "MISSING_POST_PERMISSION" = "UNVERIFIED",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChannelSystemBotAccessModal
        channel={
          {
            id: "channel-1",
            title: "Freudzone",
            preview: {
              systemBotConnection: {
                connected: status === "CONNECTED",
                status,
                botUsername: "nexeloq_bot",
                lastCheckedAt: null,
                requiredPermission: "POST_MESSAGES",
              },
            },
          } as never
        }
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("ChannelSystemBotAccessModal", () => {
  beforeEach(() => checkSystemBotAccess.mockReset());

  it("shows the minimal Telegram permission instructions", () => {
    renderModal();

    expect(screen.getByText("Connection not confirmed")).toBeInTheDocument();
    expect(screen.getByText("Post Messages")).toBeInTheDocument();
    expect(
      screen.getByText(/All other administrator permissions may stay disabled/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add in Telegram" }),
    ).toHaveAttribute(
      "href",
      "https://t.me/nexeloq_bot?startchannel&admin=post_messages",
    );
  });

  it("keeps the check button available and displays the verified result", async () => {
    checkSystemBotAccess.mockResolvedValue({
      connected: true,
      status: "CONNECTED",
      botUsername: "nexeloq_bot",
      lastCheckedAt: "2026-08-30T12:00:00.000Z",
      requiredPermission: "POST_MESSAGES",
    });
    renderModal();

    await userEvent.click(
      screen.getByRole("button", { name: "Check connection" }),
    );

    expect(await screen.findByText("Connection confirmed")).toBeInTheDocument();
    await waitFor(() =>
      expect(checkSystemBotAccess).toHaveBeenCalledWith("channel-1"),
    );
    expect(
      screen.getByRole("button", { name: "Check connection" }),
    ).toBeInTheDocument();
  });

  it("renders compact confirmed and unconfirmed card states", () => {
    const { rerender } = render(
      <ChannelSystemBotBadge
        connection={{
          connected: false,
          status: "UNVERIFIED",
          botUsername: null,
          lastCheckedAt: null,
          requiredPermission: "POST_MESSAGES",
        }}
      />,
    );
    expect(screen.getByText("Bot not checked")).toBeInTheDocument();

    rerender(
      <ChannelSystemBotBadge
        connection={{
          connected: true,
          status: "CONNECTED",
          botUsername: "nexeloq_bot",
          lastCheckedAt: "2026-08-30T12:00:00.000Z",
          requiredPermission: "POST_MESSAGES",
        }}
      />,
    );
    expect(screen.getByText("Bot connected")).toBeInTheDocument();
  });
});
