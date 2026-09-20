import type { QueryClient } from "@tanstack/react-query";
import type { MutualPromotionFolderDetail } from "@telegram-system/shared";
import {
  accountKeys,
  dashboardKeys,
  mutualPromotionFolderKeys,
  telegramChannelKeys,
} from "@/lib/query-keys";

export async function reconcileMutualPromotionFolder(
  queryClient: QueryClient,
  folder: MutualPromotionFolderDetail,
  listParams: { page: number; pageSize: number },
  financeChanged = false,
) {
  queryClient.setQueryData(mutualPromotionFolderKeys.detail(folder.id), folder);
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: mutualPromotionFolderKeys.list(listParams),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.trafficAttributions(),
    }),
    ...(financeChanged
      ? [invalidateMutualPromotionFinance(queryClient, folder)]
      : []),
  ]);
}

export async function invalidateMutualPromotionFinance(
  queryClient: QueryClient,
  folder: MutualPromotionFolderDetail,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.accounts() }),
    queryClient.invalidateQueries({ queryKey: accountKeys.transactions() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() }),
    ...folder.participants.map((participant) =>
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.financialSummary(
          participant.telegramChannelId,
        ),
      }),
    ),
  ]);
}
