"use client";

import { useState } from "react";
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
      label="Channel source"
      channelsPlaceholder="All channels"
    />
  );
}
