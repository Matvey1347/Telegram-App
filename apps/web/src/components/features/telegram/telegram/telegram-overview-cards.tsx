"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CurrencySettings,
  ExchangeRate,
  TelegramChannelNetwork,
} from "@/lib/api";
import { telegramChannelNetworksApi } from "@/lib/api";
import { MasonryGrid } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { networkKeys } from "@/lib/query-keys";
import { TelegramNetworkCard } from "./telegram-network-card";

export function sortNetworksBySize(
  networks: TelegramChannelNetwork[],
) {
  return networks
    .map((network, index) => ({
      network,
      index,
      size: network.summary.totalSubscribers,
    }))
    .sort((left, right) => {
      const leftSize = Number(left.size);
      const rightSize = Number(right.size);
      const leftValid = Number.isFinite(leftSize);
      const rightValid = Number.isFinite(rightSize);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (!leftValid) return left.index - right.index;
      return rightSize - leftSize || left.index - right.index;
    })
    .map(({ network }) => network);
}

export function TelegramNetworkCards({
  networks,
  moneySettings,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const sortedNetworks = useMemo(
    () => sortNetworksBySize(networks),
    [networks],
  );
  const [pickerGeneration, setPickerGeneration] = useState<
    Record<string, number>
  >({});
  const updateIcon = useMutation({
    mutationFn: ({
      network,
      iconId,
    }: {
      network: TelegramChannelNetwork;
      iconId: string | null;
    }) => telegramChannelNetworksApi.update(network.id, { iconId }),
    onSuccess: (updated) => {
      queryClient.setQueryData<TelegramChannelNetwork[]>(
        networkKeys.list(),
        (current = []) =>
          current.map((network) =>
            network.id === updated.id ? updated : network,
          ),
      );
      queryClient.setQueryData(networkKeys.detail(updated.id), updated);
      pushToast("Network emoji updated.", "success");
    },
    onError: (_error, variables) => {
      setPickerGeneration((current) => ({
        ...current,
        [variables.network.id]: (current[variables.network.id] || 0) + 1,
      }));
      pushToast("Failed to update network emoji.", "error");
    },
  });

  return (
    <MasonryGrid>
      {sortedNetworks.map((network) => {
        return (
          <TelegramNetworkCard
            key={network.id}
            network={network}
            moneySettings={moneySettings}
            iconPickerKey={`${network.id}:${network.iconId || "none"}:${pickerGeneration[network.id] || 0}`}
            iconUpdating={
              updateIcon.isPending &&
              updateIcon.variables?.network.id === network.id
            }
            onIconChange={(iconId) => updateIcon.mutate({ network, iconId })}
            onEdit={() => onEdit(network)}
            onDelete={() => onDelete(network)}
          />
        );
      })}
    </MasonryGrid>
  );
}
