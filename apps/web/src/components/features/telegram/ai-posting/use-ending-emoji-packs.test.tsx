import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useEndingEmojiPacks } from "./use-ending-emoji-packs";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { resolveCustomEmojiDocuments: resolve },
}));

beforeEach(() => resolve.mockReset());

it("resolves a missing saved emoji and exposes the returned asset", async () => {
  const packs = [
    { id: "pack", emojis: [{ documentId: "123", assetUrl: "/emoji.webp" }] },
  ];
  resolve.mockResolvedValue({ packs });
  const { result } = renderHook(() =>
    useEndingEmojiPacks("Test ![x](tg://emoji?id=123)", []),
  );
  await waitFor(() => expect(result.current.packs).toEqual(packs));
  expect(resolve).toHaveBeenCalledWith(
    ["123"],
    expect.any(Function),
    expect.any(AbortSignal),
  );
});

it("offers retry when Telegram cannot resolve the emoji", async () => {
  resolve.mockResolvedValue({ packs: [] });
  const { result } = renderHook(() =>
    useEndingEmojiPacks("![x](tg://emoji?id=987)", []),
  );
  await waitFor(() => expect(result.current.failed).toBe(true));
});
