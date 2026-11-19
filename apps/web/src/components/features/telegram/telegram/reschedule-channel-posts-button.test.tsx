import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestI18nProvider } from "@/test/render-with-i18n";
import { RescheduleChannelPostsButton } from "./reschedule-channel-posts-button";
const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: {
    listChannelRescheduleCandidates: mocks.plan,
    rescheduleChannelScheduledPosts: mocks.execute,
  },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.toast }),
}));
vi.mock("./managed-post-cache", () => ({
  invalidateManagedPostScheduleReads: vi.fn(),
}));

const success = {
  rescheduledCount: 72,
  returnedToDraftCount: 0,
  alreadyPublishedCount: 0,
  locallyScheduledCount: 0,
  failedCount: 0,
  failedPostIds: [],
  results: [],
};
function mountAndStart() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <TestI18nProvider>
        <RescheduleChannelPostsButton
          channelId="channel-1"
          channelTitle="News"
        />
      </TestI18nProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getAllByRole("button").at(-1)!);
}

describe("reschedule results", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reconciles 72 candidates in one bounded streamed request and keeps progress monotonic", async () => {
    const postIds = Array.from({ length: 72 }, (_, index) => `post-${index}`);
    mocks.plan.mockResolvedValue({ postIds });
    let finish!: (result: typeof success) => void;
    mocks.execute.mockImplementation((_channel, _posts, onProgress) => {
      onProgress({ stage: "LOADING_TELEGRAM_SCHEDULE" }, 36, 72);
      onProgress({ stage: "RECONCILING_TELEGRAM" }, 0, 72);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    mountAndStart();
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "36",
      ),
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][1]).toEqual(postIds);
    finish(success);
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "72",
      ),
    );
  });

  it("retains the same candidates after a network failure without loading a new plan", async () => {
    mocks.plan.mockResolvedValue({ postIds: ["one", "two"] });
    mocks.execute
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce(success);
    mountAndStart();
    await waitFor(() =>
      expect(screen.getByText("Connection interrupted")).toBeVisible(),
    );
    fireEvent.click(screen.getAllByRole("button").at(-1)!);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[1][1]).toEqual(["one", "two"]);
  });
  it("keeps the modal and precise per-post errors visible and retries failed IDs", async () => {
    mocks.plan.mockResolvedValue({
      postIds: ["successful-post", "failed-post"],
    });
    mocks.execute
      .mockResolvedValueOnce({
        rescheduledCount: 0,
        returnedToDraftCount: 0,
        alreadyPublishedCount: 0,
        locallyScheduledCount: 0,
        failedCount: 1,
        failedPostIds: ["failed-post"],
        results: [
          {
            postId: "failed-post",
            title: "News post",
            stage: "FAILED",
            message: "Original account cannot cancel this schedule",
          },
        ],
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <TestI18nProvider>
          <RescheduleChannelPostsButton
            channelId="channel-1"
            channelTitle="News"
          />
        </TestI18nProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(screen.getByText(/Original account cannot cancel/)).toBeVisible(),
    );
    expect(screen.getByText("News post")).toBeVisible();
    const retry = screen.getAllByRole("button").at(-1)!;
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[1][1]).toEqual(["failed-post"]);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "1",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
