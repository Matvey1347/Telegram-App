import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdSalePlacementLifecyclePreview } from "./ad-sale-placement-lifecycle-preview";

afterEach(() => vi.useRealTimers());

describe("AdSalePlacementLifecyclePreview", () => {
  it("animates pending and shows observed publication confirmation for three seconds before the post timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
    const pending = {
      id: "placement",
      telegramChannelId: "channel",
      scheduledAt: "2026-08-30T11:00:00.000Z",
      publishedAt: null,
      plannedDeleteAt: "2026-08-31T12:00:00.000Z",
      deletedAt: null,
    };
    const props = {
      channelsById: new Map([
        ["channel", { id: "channel", title: "Channel" } as never],
      ]),
      now: Date.now(),
    };
    const view = render(
      <AdSalePlacementLifecyclePreview
        {...props}
        placements={[pending as never]}
      />,
    );
    expect(
      screen.getByLabelText("Publication pending").closest("p"),
    ).toHaveClass("text-amber-300");
    act(() =>
      view.rerender(
        <AdSalePlacementLifecyclePreview
          {...props}
          placements={[
            { ...pending, publishedAt: "2026-08-30T11:59:00.000Z" } as never,
          ]}
        />,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Published ✅")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.queryByText("Published ✅")).toBeNull();
    expect(screen.getByText(/Auto-delete in/)).toBeInTheDocument();
  });

  it("shows confirmation for a group only after its last placement publishes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
    const base = {
      telegramChannelId: "channel",
      scheduledAt: "2026-08-30T11:00:00.000Z",
      publishedAt: null,
      plannedDeleteAt: "2026-08-31T12:00:00.000Z",
    };
    const props = {
      channelsById: new Map([
        ["channel", { id: "channel", title: "Channel" } as never],
      ]),
      now: Date.now(),
    };
    const view = render(
      <AdSalePlacementLifecyclePreview
        {...props}
        placements={[
          { ...base, id: "one" } as never,
          { ...base, id: "two" } as never,
        ]}
      />,
    );
    view.rerender(
      <AdSalePlacementLifecyclePreview
        {...props}
        placements={[
          {
            ...base,
            id: "one",
            publishedAt: "2026-08-30T12:00:00.000Z",
          } as never,
          { ...base, id: "two" } as never,
        ]}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("Published ✅")).toBeNull();
    view.rerender(
      <AdSalePlacementLifecyclePreview
        {...props}
        placements={[
          {
            ...base,
            id: "one",
            publishedAt: "2026-08-30T12:00:00.000Z",
          } as never,
          {
            ...base,
            id: "two",
            publishedAt: "2026-08-30T12:00:01.000Z",
          } as never,
        ]}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Published ✅")).toBeInTheDocument();
  });
});
