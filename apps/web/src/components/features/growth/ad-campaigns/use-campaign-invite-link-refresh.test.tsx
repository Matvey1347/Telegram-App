// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";
import { adCampaignKeys, telegramChannelKeys } from "@/lib/query-keys";
import { useCampaignInviteLinkRefresh } from "./use-campaign-invite-link-refresh";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  windows: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  adCampaignsApi: {
    refreshInviteLinkData: mocks.refresh,
    refreshInviteLinkWindows: mocks.windows,
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.toast }),
}));

it("invalidates the campaign window, history and channel invite list after a partial refresh", async () => {
  const campaignId = "campaign-fixture";
  const channelId = "channel-fixture";
  const client = new QueryClient();
  const keys = [
    adCampaignKeys.inviteLinkWindows(campaignId),
    adCampaignKeys.inviteLinkHistory(campaignId),
    telegramChannelKeys.inviteLinks(channelId),
  ];
  for (const key of keys) client.setQueryData(key, { known: 8 });
  mocks.refresh.mockResolvedValue({ refreshedLinks: 1, totalLinks: 1, failedLinks: [] });
  mocks.windows.mockResolvedValue(["retained-window"]);
  const { result, unmount } = renderHook(useCampaignInviteLinkRefresh, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => result.current.refreshInviteLinks({
    id: campaignId, ownTelegramChannelId: channelId, inviteLinkWindows: [{}],
  } as Parameters<typeof result.current.refreshInviteLinks>[0]));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
    expect.stringContaining("Last confirmed window metrics are retained"), "info",
  ));
  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryData(key)).toEqual({ known: 8 });
  }
  unmount();
  client.clear();
});

it("refetches an active consumer after the second request fails following a persisted write", async () => {
  mocks.toast.mockClear();
  const campaignId = "campaign-partial";
  const channelId = "channel-partial";
  const key = telegramChannelKeys.inviteLinks(channelId);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let saved = 8;
  const load = vi.fn(async () => saved);
  mocks.refresh.mockImplementationOnce(async () => {
    saved = 9;
    return { refreshedLinks: 1, totalLinks: 1, failedLinks: [] };
  });
  mocks.windows.mockRejectedValueOnce(new Error("window request interrupted"));
  const { result, unmount } = renderHook(() => ({
    ...useCampaignInviteLinkRefresh(),
    joined: useQuery({ queryKey: key, queryFn: load }).data,
  }), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.joined).toBe(8));
  act(() => result.current.refreshInviteLinks({
    id: campaignId, ownTelegramChannelId: channelId, inviteLinkWindows: [{}],
  } as Parameters<typeof result.current.refreshInviteLinks>[0]));
  await waitFor(() => expect(result.current.joined).toBe(9));
  expect(load).toHaveBeenCalledTimes(2);
  expect(mocks.toast).toHaveBeenCalledWith("window request interrupted", "error");
  unmount();
  client.clear();
});
