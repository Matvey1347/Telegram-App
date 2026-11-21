import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useChannelAnalyticsMutations } from "./use-channel-analytics-mutations";
import { useChannelAnalyticsQueries } from "./use-channel-analytics-queries";
import { useChannelAnalyticsReport } from "./use-channel-analytics-report";

const api = vi.hoisted(() => ({
  analytics: vi.fn(),
  detail: vi.fn(),
  audience: vi.fn(),
  financialSummary: vi.fn(),
  audienceSnapshots: vi.fn(),
  posts: vi.fn(),
  inviteLinks: vi.fn(),
  campaigns: vi.fn(),
  sync: vi.fn(),
  setProgress: vi.fn(),
  clearProgress: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  adCampaignsApi: { listPage: api.campaigns },
  currenciesApi: { getSettings: vi.fn(), listLatestRates: vi.fn() },
  getTelegramChannelAnalytics: api.analytics,
  getTelegramChannelPosts: api.posts,
  getTelegramChannelInviteLinks: api.inviteLinks,
  syncTelegramChannelNowWithProgress: api.sync,
  telegramChannelsApi: {
    get: api.detail,
    audience: api.audience,
    financialSummary: api.financialSummary,
    audienceSnapshots: api.audienceSnapshots,
  },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    setProgress: api.setProgress,
    clearProgress: api.clearProgress,
    pushToast: api.pushToast,
  }),
}));

function configureChannel() {
  const id = "analytics-channel";
  const channel = { id, title: "Analytics", currentSubscribersCount: 98 };
  api.analytics.mockResolvedValue({
    channel,
    summary: { postsTotal: 2, telegramPostsStoredTotal: 12, campaignsCount: 0 },
  });
  api.detail.mockResolvedValue(channel);
  api.audience.mockResolvedValue({});
  api.financialSummary.mockResolvedValue({});
  api.posts.mockResolvedValue({ items: [] });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const queries = useChannelAnalyticsQueries(id);
      const report = useChannelAnalyticsReport(id, queries);
      const mutations = useChannelAnalyticsMutations(id, queries);
      return { queries, report, mutations };
    },
    { wrapper },
  );
  return { ...view, client, id };
}

describe("channel analytics data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("shows summary metrics and waits for a section to open before fetching its rows", async () => {
    const view = configureChannel();
    await waitFor(() =>
      expect(view.result.current.report.computed.postsCount).toBe(12),
    );

    expect(api.posts).not.toHaveBeenCalled();
    expect(api.inviteLinks).not.toHaveBeenCalled();
    expect(api.audienceSnapshots).not.toHaveBeenCalled();
    expect(api.campaigns).not.toHaveBeenCalled();

    act(() => {
      view.result.current.queries.setOpenSections((sections) => ({
        ...sections,
        posts: true,
      }));
    });

    await waitFor(() =>
      expect(api.posts).toHaveBeenCalledWith(view.id, {
        page: 1,
        pageSize: 10,
        search: undefined,
      }),
    );
  });

  it("invalidates publishing capabilities when sync returns an error", async () => {
    const view = configureChannel();
    const queryKey = telegramChannelKeys.publishingCapabilities();
    view.client.setQueryData(queryKey, { existing: true });
    api.sync.mockRejectedValueOnce(new Error("Transport disconnected"));

    await waitFor(() =>
      expect(view.result.current.queries.channel?.id).toBe(view.id),
    );
    await act(async () => {
      await expect(
        view.result.current.mutations.syncMutation.mutateAsync({}),
      ).rejects.toThrow("Transport disconnected");
    });

    expect(view.client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(api.clearProgress).toHaveBeenCalledWith(
      "telegram-channel-sync:" + view.id,
    );
    expect(api.pushToast).toHaveBeenCalledWith("Sync failed.", "error");
  });
});
