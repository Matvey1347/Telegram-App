import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RescheduleChannelScheduledPostProgress } from "@telegram-system/shared";
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
  results: [] as RescheduleChannelScheduledPostProgress[],
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
  it("removes the processing heartbeat after completion and retains the post outcome", async () => {
    mocks.plan.mockResolvedValue({ postIds: ["heartbeat-post"] });
    let finish!: (result: typeof success) => void;
    mocks.execute.mockImplementation(
      (_channel, _posts, onProgress, options) => {
        onProgress(
          {
            postId: "heartbeat-post",
            title: "Morning publication",
            stage: "SCHEDULING_AGAIN",
          },
          0,
          1,
        );
        options.onHeartbeat();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    mountAndStart();
    const heartbeat =
      "The server is processing the request; waiting for the current operation to finish…";
    await waitFor(() => expect(screen.getByText(heartbeat)).toBeVisible());
    expect(screen.getAllByRole("button").at(-1)).toBeDisabled();
    await act(async () =>
      finish({
        ...success,
        rescheduledCount: 1,
        results: [
          {
            postId: "heartbeat-post",
            title: "Morning publication",
            stage: "RESCHEDULED",
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button").at(-1)).toBeEnabled(),
    );
    expect(screen.queryByText(heartbeat)).not.toBeInTheDocument();
    expect(screen.getByText("Morning publication")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(document.querySelectorAll(".lucide-check")).toHaveLength(1);
  });

  it("removes the processing heartbeat after a stream error and keeps its precise error", async () => {
    mocks.plan.mockResolvedValue({ postIds: ["heartbeat-post"] });
    let fail!: (error: Error) => void;
    mocks.execute.mockImplementation(
      (_channel, _posts, onProgress, options) => {
        onProgress(
          {
            postId: "heartbeat-post",
            title: "Evening publication",
            stage: "RECONCILING_TELEGRAM",
          },
          0,
          1,
        );
        options.onHeartbeat();
        return new Promise((_resolve, reject) => {
          fail = reject;
        });
      },
    );
    mountAndStart();
    const heartbeat =
      "The server is processing the request; waiting for the current operation to finish…";
    await waitFor(() => expect(screen.getByText(heartbeat)).toBeVisible());
    await act(async () =>
      fail(
        new Error("Telegram connection interrupted; reconcile before retrying"),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button").at(-1)).toBeEnabled(),
    );
    expect(screen.queryByText(heartbeat)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Telegram connection interrupted; reconcile before retrying",
      ),
    ).toBeVisible();
    expect(screen.getByText("Evening publication")).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), "error", 7000);
  });
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

  it("shows 72 preserved Telegram schedules as successful without counting them as rescheduled", async () => {
    const postIds = Array.from(
      { length: 72 },
      (_, index) => `preserved-${index}`,
    );
    mocks.plan.mockResolvedValue({ postIds });
    mocks.execute.mockResolvedValue({
      ...success,
      rescheduledCount: 0,
      nativelyScheduledCount: 72,
      results: postIds.map((postId) => ({
        postId,
        title: `Confirmed ${postId}`,
        stage: "NATIVE_SCHEDULE_PRESERVED",
      })),
    });
    mountAndStart();
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.stringContaining(
          "Rescheduled: 0; already published: 0; local schedules preserved: 0; already scheduled in Telegram: 72;",
        ),
        "success",
        9000,
      ),
    );
    expect(
      screen.getAllByText("Already scheduled in Telegram; left unchanged"),
    ).toHaveLength(72);
    expect(screen.getByText("Confirmed preserved-71")).toBeVisible();
    expect(document.querySelectorAll(".lucide-check")).toHaveLength(72);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
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
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.stringContaining("already scheduled in Telegram: 0;"),
        "success",
        9000,
      ),
    );
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
