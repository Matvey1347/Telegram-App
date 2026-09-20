import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { MutualPromotionFolderDetail } from "@telegram-system/shared";
import {
  accountKeys,
  dashboardKeys,
  telegramChannelKeys,
} from "@/lib/query-keys";
import { reconcileMutualPromotionFolder } from "./mutual-promotion-finance-cache";

const folder = {
  id: "folder-1",
  participants: [{ telegramChannelId: "channel-1", expense: { amount: 5 } }],
} as MutualPromotionFolderDetail;

describe("reconcileMutualPromotionFolder", () => {
  it("invalidates Finance reads only after an expense-changing action", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await reconcileMutualPromotionFolder(client, folder, { page: 1, pageSize: 100 });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: accountKeys.transactions(),
    });

    invalidate.mockClear();
    await reconcileMutualPromotionFolder(
      client,
      folder,
      { page: 1, pageSize: 100 },
      true,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accountKeys.accounts() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accountKeys.transactions() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardKeys.summary() });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: telegramChannelKeys.financialSummary("channel-1"),
    });
  });
});
