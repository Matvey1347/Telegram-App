import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTransientActionStatus } from "./use-transient-action-status";

describe("useTransientActionStatus", () => {
  afterEach(() => vi.useRealTimers());

  it("animates sending dots and returns to idle after the sent state", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientActionStatus(1800));

    act(() => result.current.start());
    expect(result.current).toMatchObject({ status: "sending", dots: 1 });
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.dots).toBe(2);

    act(() => result.current.sent());
    expect(result.current.status).toBe("sent");
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current.status).toBe("idle");
  });
});
