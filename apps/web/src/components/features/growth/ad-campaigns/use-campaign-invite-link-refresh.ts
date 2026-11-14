"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adCampaignsApi,
  type AdCampaign,
  type AdCampaignInviteLinkRefreshProgress,
} from "@/lib/api";
import { adCampaignKeys, telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

export type CampaignInviteLinkRefreshState = {
  campaignId: string;
  current: number;
  total: number;
  item: AdCampaignInviteLinkRefreshProgress;
};

export function useCampaignInviteLinkRefresh() {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [progress, setProgress] =
    useState<CampaignInviteLinkRefreshState | null>(null);
  const mutation = useMutation({
    mutationFn: async (campaign: AdCampaign) => {
      const result = await adCampaignsApi.refreshInviteLinkData(
        campaign.id,
        (item, current, total) =>
          setProgress({ campaignId: campaign.id, item, current, total }),
      );
      const failedWindows = campaign.inviteLinkWindows?.length ? await adCampaignsApi.refreshInviteLinkWindows(campaign.id) : [];
      return { ...result, failedWindows };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adCampaignKeys.list() }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.cardLists(),
        }),
      ]);
      const failed = result.failedLinks.length + result.failedWindows.length;
      pushToast(
        failed
          ? `Updated ${result.refreshedLinks} of ${result.totalLinks} invite links. ${failed} failed: ${result.failedLinks[0]?.message ?? "check Telegram access"}`
          : `Updated ${result.refreshedLinks} of ${result.totalLinks} invite links.`,
        failed ? "info" : "success",
      );
    },
    onError: (error) =>
      pushToast(
        error instanceof Error && error.message
          ? error.message
          : "Failed to refresh invite-link data.",
        "error",
      ),
    onSettled: () => setProgress(null),
  });

  return {
    refreshInviteLinks: mutation.mutate,
    refreshingCampaignId: mutation.isPending ? mutation.variables?.id : null,
    progress,
  };
}
