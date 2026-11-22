import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useTelegramChannelsWorkspaceReads } from "./use-telegram-channels-workspace-reads";

const { listWithCounts } = vi.hoisted(() => ({ listWithCounts: vi.fn() }));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { listWithCounts },
  telegramChannelNetworksApi: { list: vi.fn() },
  currenciesApi: { getSettings: vi.fn(), listLatestRates: vi.fn() },
}));

it("renders cached channel requests immediately and saves the fresh count in the same cache", async () => {
  const client = new QueryClient();
  const key = [
    ...telegramChannelKeys.lifecycleList("active", true),
    "content-horizon-v2",
  ];
  const cached = { items: [{ id: "channel", pendingJoinRequestsCount: 5 }] };
  const fresh = { items: [{ id: "channel", pendingJoinRequestsCount: 12 }] };
  client.setQueryData(key, cached);
  let complete!: (value: typeof fresh) => void;
  listWithCounts.mockImplementationOnce(
    () =>
      new Promise<typeof fresh>((resolve) => {
        complete = resolve;
      }),
  );
  const { result, unmount } = renderHook(
    () =>
      useTelegramChannelsWorkspaceReads({
        tab: "channels",
        lifecycleTab: "active",
        networkFormOpen: false,
        editingNetwork: null,
        messageTemplatesOpen: false,
        exportOpen: false,
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );

  expect(result.current.channels).toEqual(cached.items);
  expect(listWithCounts).toHaveBeenCalledWith("active", true, true);
  complete(fresh);
  await waitFor(() => expect(result.current.channels).toEqual(fresh.items));
  expect(client.getQueryData(key)).toEqual(fresh);
  unmount();
  client.clear();
});
