"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adCampaignsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import {
  accountKeys,
  adCampaignKeys,
  dashboardKeys,
  telegramChannelKeys,
} from "@/lib/query-keys";

function affectedKeys() {
  return [
    adCampaignKeys.list(),
    accountKeys.accounts(),
    accountKeys.transactions(),
    dashboardKeys.summary(),
    telegramChannelKeys.lists(),
    telegramChannelKeys.cardLists(),
    telegramChannelKeys.trafficAttributions(),
  ];
}

export function useAdCampaignMutations() {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const saveWindows = async (id: string, windows: Array<{ inviteLinkId: string; fromDate: string | null }>) => {
    const result = await adCampaignsApi.setInviteLinkWindows(id, windows);
    await queryClient.invalidateQueries({ queryKey: ["ad-campaign-invite-windows", id] });
    if (result.failed.length) pushToast("Даты сохранены, но Telegram не вернул данные по некоторым ссылкам. Обновите ссылки позже.", "info");
  };
  const invalidateAffected = () =>
    Promise.all(
      affectedKeys().map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Parameters<typeof adCampaignsApi.create>[0], "inviteLinkWindows"> & { inviteLinkWindows?: Record<string, string> }) => {
      const { inviteLinkWindows, ...campaign } = payload;
      const result = await adCampaignsApi.create(campaign);
      if (inviteLinkWindows && Object.values(inviteLinkWindows).some(Boolean)) {
        const windows = (Array.isArray(payload.inviteLinkIds) ? payload.inviteLinkIds as string[] : []).map((inviteLinkId) => ({ inviteLinkId, fromDate: inviteLinkWindows[inviteLinkId] || null }));
        await saveWindows(result.id, windows);
      }
      return result;
    },
    onSuccess: () => void invalidateAffected(),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Omit<Parameters<typeof adCampaignsApi.update>[1], "inviteLinkWindows"> & { inviteLinkWindows?: Record<string, string> };
    }) => {
      const { inviteLinkWindows, ...campaign } = payload;
      return adCampaignsApi.update(id, campaign).then(async (result) => {
        if (inviteLinkWindows) {
          const windows = (Array.isArray(payload.inviteLinkIds) ? payload.inviteLinkIds as string[] : []).map((inviteLinkId) => ({ inviteLinkId, fromDate: inviteLinkWindows[inviteLinkId] || null }));
          await saveWindows(id, windows);
        }
        return result;
      });
    },
    onSuccess: () => void invalidateAffected(),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adCampaignsApi.remove(id),
    onSuccess: () => {
      void invalidateAffected();
      void queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      void queryClient.invalidateQueries({ queryKey: ["promos"] });
    },
  });
  return { createMutation, updateMutation, deleteMutation };
}
