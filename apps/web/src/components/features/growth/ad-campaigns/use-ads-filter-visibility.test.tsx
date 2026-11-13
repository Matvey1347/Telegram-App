import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdsFilterVisibility } from "./use-ads-filter-visibility";

describe("advertising filters preference", () => {
  beforeEach(() => localStorage.clear());
  it("starts hidden and restores both open and closed choices after remount", async () => {
    const first = renderHook(useAdsFilterVisibility);
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    first.unmount();
    const second = renderHook(useAdsFilterVisibility);
    await waitFor(() => expect(second.result.current[0]).toBe(true));
    act(() => second.result.current[1]());
    second.unmount();
    expect(renderHook(useAdsFilterVisibility).result.current[0]).toBe(false);
  });
  it("remains usable if browser storage is denied", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Denied"); });
    const view = renderHook(useAdsFilterVisibility);
    act(() => view.result.current[1]());
    expect(view.result.current[0]).toBe(true);
    spy.mockRestore();
  });
});
