import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CrmMessageListItem } from "@telegram-system/shared";
import { useCrmReactionAssets } from "./use-crm-reaction-assets";
import { crmChatActionsApi } from "./crm-chat-actions-api";

vi.mock("./crm-chat-actions-api", () => ({ crmChatActionsApi: { reactionAssets: vi.fn() } }));
const message = (id: string, emoji: string) => ({ id, contentMetadata: { reactions: [{ emoji, count: 1 }] } }) as unknown as CrmMessageListItem;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;

describe("reaction assets", () => {
  it("loads custom reactions together and leaves standard reactions alone", async () => {
    vi.mocked(crmChatActionsApi.reactionAssets).mockResolvedValue({ items: { "123": { type: "unicode", value: "🤝" } } });
    const { result } = renderHook(() => useCrmReactionAssets("workspace", "chat", [message("a", "custom:123"), message("b", "👍"), message("c", "custom:123")]), { wrapper });
    await waitFor(() => expect(result.current["123"]?.value).toBe("🤝"));
    expect(crmChatActionsApi.reactionAssets).toHaveBeenCalledOnce();
    expect(crmChatActionsApi.reactionAssets).toHaveBeenCalledWith("chat", ["a", "c"], ["123"], expect.any(AbortSignal));
  });
  it("splits diverse documents into bounded batches", async () => {
    vi.mocked(crmChatActionsApi.reactionAssets).mockClear().mockResolvedValue({ items: {} });
    const rows = Array.from({ length: 11 }, (_, index) => message(String(index), `custom:${index + 1}`));
    renderHook(() => useCrmReactionAssets("workspace", "chat", rows), { wrapper });
    await waitFor(() => expect(crmChatActionsApi.reactionAssets).toHaveBeenCalledTimes(3));
    for (const call of vi.mocked(crmChatActionsApi.reactionAssets).mock.calls) expect(call[2].length).toBeLessThanOrEqual(5);
  });
  it("does not request assets for ordinary reactions", () => {
    vi.mocked(crmChatActionsApi.reactionAssets).mockClear();
    renderHook(() => useCrmReactionAssets("workspace", "chat", [message("a", "❤️")]), { wrapper });
    expect(crmChatActionsApi.reactionAssets).not.toHaveBeenCalled();
  });
});
