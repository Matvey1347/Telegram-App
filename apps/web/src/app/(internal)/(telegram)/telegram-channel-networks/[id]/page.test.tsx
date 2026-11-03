import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  telegramChannelNetworksApi,
  telegramChannelsApi,
} from "@/lib/api";
import { networkKeys } from "@/lib/query-keys";
import TelegramChannelNetworkDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "network-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-network-form-modal",
  () => ({
    TelegramNetworkFormModal: ({
      onSubmit,
    }: {
      onSubmit: (payload: {
        name: string;
        telegramChannelIds: string[];
      }) => void;
    }) => (
      <div data-testid="network-form-modal">
        <button
          onClick={() => onSubmit({ name: "Updated", telegramChannelIds: [] })}
        >
          Save network
        </button>
      </div>
    ),
  }),
);

describe("Telegram network detail loading", () => {
  beforeEach(() => {
    vi.spyOn(telegramChannelNetworksApi, "get").mockResolvedValue({
      id: "network-1",
      name: "Network",
      isSystem: false,
      summary: null,
      channelSummaries: [],
    } as never);
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
  });

  it("loads the channel catalog on edit and reconciles the returned detail", async () => {
    const updated = {
      id: "network-1",
      name: "Updated",
      isSystem: false,
      summary: null,
      channelSummaries: [],
    };
    vi.spyOn(telegramChannelNetworksApi, "update").mockResolvedValue(
      updated as never,
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TelegramChannelNetworkDetailPage />
      </QueryClientProvider>,
    );

    await screen.findByRole("button", { name: "Edit" });
    expect(telegramChannelsApi.select).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() =>
      expect(telegramChannelsApi.select).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByTestId("network-form-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save network" }));
    await waitFor(() =>
      expect(client.getQueryData(networkKeys.detail("network-1"))).toEqual(
        updated,
      ),
    );
    expect(telegramChannelNetworksApi.get).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
