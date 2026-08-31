import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdSalesPublicationRefresh } from "./use-ad-sales-publication-refresh";

const pendingSale = {
  id: "sale",
  placements: [
    {
      id: "placement",
      scheduledAt: "2020-01-01T00:00:00.000Z",
      publishedAt: null,
      managedPost: null,
    },
  ],
};

afterEach(() => vi.useRealTimers());

describe("useAdSalesPublicationRefresh", () => {
  it("stops after four bounded list reads while publication remains pending", async () => {
    vi.useFakeTimers();
    const refetch = vi
      .fn()
      .mockResolvedValue({ data: { items: [pendingSale] } });
    renderHook(() =>
      useAdSalesPublicationRefresh({
        active: true,
        sales: [pendingSale as never],
        refetch,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    expect(refetch).toHaveBeenCalledTimes(4);
  });

  it("stops immediately when the refreshed sale is published", async () => {
    vi.useFakeTimers();
    const refetch = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            ...pendingSale,
            placements: [
              {
                ...pendingSale.placements[0],
                publishedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
      },
    });
    renderHook(() =>
      useAdSalesPublicationRefresh({
        active: true,
        sales: [pendingSale as never],
        refetch,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not refresh a placement whose managed post failed without an error message", async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    renderHook(() =>
      useAdSalesPublicationRefresh({
        active: true,
        sales: [
          {
            ...pendingSale,
            placements: [
              {
                ...pendingSale.placements[0],
                managedPost: { status: "FAILED" },
              },
            ],
          } as never,
        ],
        refetch,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("resumes the bounded refresh budget when a hidden tab becomes visible", async () => {
    vi.useFakeTimers();
    const refetch = vi
      .fn()
      .mockResolvedValue({ data: { items: [pendingSale] } });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    renderHook(() =>
      useAdSalesPublicationRefresh({
        active: true,
        sales: [pendingSale as never],
        refetch,
      }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(refetch).not.toHaveBeenCalled();
    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    expect(refetch).toHaveBeenCalledTimes(4);
  });

  it("keeps one four-read page budget while the pending set changes", async () => {
    vi.useFakeTimers();
    const twoPending = {
      ...pendingSale,
      placements: [
        pendingSale.placements[0],
        { ...pendingSale.placements[0], id: "placement-2" },
      ],
    };
    const refetch = vi
      .fn()
      .mockResolvedValue({ data: { items: [pendingSale] } });
    const { rerender } = renderHook(
      ({ sales }) =>
        useAdSalesPublicationRefresh({ active: true, sales, refetch }),
      { initialProps: { sales: [twoPending as never] } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    rerender({ sales: [pendingSale as never] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    expect(refetch).toHaveBeenCalledTimes(4);
  });
});
