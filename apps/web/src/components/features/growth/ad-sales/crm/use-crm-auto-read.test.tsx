import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCrmAutoRead } from "./use-crm-auto-read";
import { acquireBodyScrollLock } from "@/lib/body-scroll-lock";

beforeEach(() => { vi.spyOn(document, "hasFocus").mockReturnValue(true); });
afterEach(() => vi.restoreAllMocks());

describe("automatic read while viewing a CRM conversation", () => {
  it("waits for successful loading and a rendered numeric watermark, then marks each new watermark once", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const markRead = vi.fn();
    const initial = { enabled: false, nearBottom: true, unreadCount: 2, latestVisibleId: null as number | null, pending: false, failed: false, markRead };
    const { rerender } = renderHook((props) => useCrmAutoRead(props), { initialProps: initial });
    rerender({ ...initial, latestVisibleId: 10 });
    expect(markRead).not.toHaveBeenCalled();
    rerender({ ...initial, enabled: true });
    expect(markRead).not.toHaveBeenCalled();
    rerender({ ...initial, enabled: true, latestVisibleId: 10 });
    expect(markRead).toHaveBeenCalledExactlyOnceWith(10);
    rerender({ ...initial, enabled: true, latestVisibleId: 10 });
    expect(markRead).toHaveBeenCalledTimes(1);
    rerender({ ...initial, enabled: true, latestVisibleId: 11, pending: true });
    expect(markRead).toHaveBeenCalledTimes(1);
    rerender({ ...initial, enabled: true, latestVisibleId: 11 });
    expect(markRead).toHaveBeenLastCalledWith(11);
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("does not mark hidden pages or an older part of the conversation", () => {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const markRead = vi.fn();
    const initial = { enabled: true, nearBottom: true, unreadCount: 1, latestVisibleId: 25, pending: false, failed: false, markRead };
    const { rerender } = renderHook((props) => useCrmAutoRead(props), { initialProps: initial });
    expect(markRead).not.toHaveBeenCalled();
    rerender({ ...initial, nearBottom: false });
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(markRead).not.toHaveBeenCalled();
    rerender(initial);
    expect(markRead).toHaveBeenCalledExactlyOnceWith(25);
  });

  it("waits when the browser loses focus and resumes for the new watermark on focus", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let focused = false;
    vi.mocked(document.hasFocus).mockImplementation(() => focused);
    const markRead = vi.fn();
    const initial = { enabled: true, nearBottom: true, unreadCount: 1, latestVisibleId: 25, pending: false, failed: false, markRead };
    const { rerender } = renderHook((props) => useCrmAutoRead(props), { initialProps: initial });
    expect(markRead).not.toHaveBeenCalled();
    act(() => { focused = true; window.dispatchEvent(new Event("focus")); });
    expect(markRead).toHaveBeenCalledExactlyOnceWith(25);
    act(() => { focused = false; window.dispatchEvent(new Event("blur")); });
    rerender({ ...initial, unreadCount: 2, latestVisibleId: 26 });
    expect(markRead).toHaveBeenCalledTimes(1);
    act(() => { focused = true; window.dispatchEvent(new Event("focus")); });
    expect(markRead).toHaveBeenLastCalledWith(26);
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("never retries a failed read automatically, even after another message arrives", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const markRead = vi.fn();
    const initial = { enabled: true, nearBottom: true, unreadCount: 1, latestVisibleId: 20, pending: false, failed: false, markRead };
    const { rerender } = renderHook((props) => useCrmAutoRead(props), { initialProps: initial });
    expect(markRead).toHaveBeenCalledExactlyOnceWith(20);
    rerender({ ...initial, failed: true, latestVisibleId: 21, unreadCount: 2 });
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("waits until every nested overlay is closed, then reads the visible watermark", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const outer = acquireBodyScrollLock();
    const inner = acquireBodyScrollLock();
    const markRead = vi.fn();
    renderHook(() => useCrmAutoRead({ enabled: true, nearBottom: true, unreadCount: 1, latestVisibleId: 20, pending: false, failed: false, markRead }));
    expect(markRead).not.toHaveBeenCalled();
    act(() => outer());
    expect(markRead).not.toHaveBeenCalled();
    act(() => inner());
    expect(markRead).toHaveBeenCalledExactlyOnceWith(20);
  });
});
