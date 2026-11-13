"use client";

import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";

export function AdsChannelScopeFilter({
  networks,
  channels,
  onChange,
}: {
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onChange: (channelIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<TelegramChannelScopeMode>("channels");
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

  const emit = (
    nextMode: TelegramChannelScopeMode,
    nextNetworkId: string,
    nextChannelIds: string[],
  ) =>
    onChange(
      resolveTelegramChannelScopeIds({
        mode: nextMode,
        selectedNetworkId: nextNetworkId,
        selectedChannelIds: nextChannelIds,
        networks,
      }),
    );

  return (
    <TelegramChannelScopeSelector
      mode={mode}
      selectedNetworkId={selectedNetworkId}
      selectedChannelIds={selectedChannelIds}
      networks={networks}
      channels={channels}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        emit(nextMode, selectedNetworkId, selectedChannelIds);
      }}
      onNetworkChange={(networkId) => {
        setSelectedNetworkId(networkId);
        emit(mode, networkId, selectedChannelIds);
      }}
      onChannelsChange={(channelIds) => {
        setSelectedChannelIds(channelIds);
        emit(mode, selectedNetworkId, channelIds);
      }}
      label={t("ads.channel_source")}
      channelsPlaceholder={t("ads.all_channels")}
      networkLabel={t("ads.network")}
      channelsLabel={t("ads.channels")}
      networkPlaceholder={t("ads.choose_network")}
    />
  );
}
