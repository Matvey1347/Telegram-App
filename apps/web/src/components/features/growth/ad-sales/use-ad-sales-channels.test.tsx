import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdSalesChannels } from "./use-ad-sales-channels";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { select: mocks.select },
}));

describe("useAdSalesChannels", () => {
  beforeEach(() => {
    mocks.select.mockReset().mockResolvedValue([
      { id: "ready", title: "Ready", canPostMessages: true },
      { id: "readonly", title: "Readonly", canPostMessages: false },
    ]);
  });

  it("loads all owned channels with one compact request", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAdSalesChannels(true), { wrapper });

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledWith({ owned: true });
    expect(result.current.channels).toHaveLength(2);
    expect(
      result.current.saleableChannels.map((channel) => channel.id),
    ).toEqual(["ready"]);
  });
});
