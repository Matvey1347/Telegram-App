"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adCampaignsApi } from "@/lib/api";
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
    telegramChannelKeys.trafficAttributions(),
  ];
}

export function useAdCampaignMutations() {
  const queryClient = useQueryClient();
  const invalidateAffected = () =>
    Promise.all(
      affectedKeys().map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  const createMutation = useMutation({
    mutationFn: adCampaignsApi.create,
    onSuccess: () => void invalidateAffected(),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof adCampaignsApi.update>[1];
    }) => adCampaignsApi.update(id, payload),
    onSuccess: () => void invalidateAffected(),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adCampaignsApi.remove(id),
    onSuccess: () => {
      void invalidateAffected();
      void queryClient.invalidateQueries({
        queryKey: ["ad-campaigns-performance"],
      });
      void queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      void queryClient.invalidateQueries({ queryKey: ["promos"] });
    },
  });
  return { createMutation, updateMutation, deleteMutation };
}
