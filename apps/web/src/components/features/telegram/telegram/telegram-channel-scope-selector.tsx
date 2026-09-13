"use client";

import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { CustomSelect, MultiSelect } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type TelegramChannelScopeMode = "network" | "channels";

export function resolveTelegramChannelScopeIds({
  mode,
  selectedNetworkId,
  selectedChannelIds,
  networks,
}: {
  mode: TelegramChannelScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: TelegramChannelNetwork[];
}) {
  if (mode === "channels") return [...new Set(selectedChannelIds)];
  if (!selectedNetworkId) return [];
  return [
    ...new Set(
      networks
        .find((network) => network.id === selectedNetworkId)
        ?.channels.map((channel) => channel.id) ?? [],
    ),
  ];
}

export function TelegramChannelScopeModeToggle({
  mode,
  onChange,
  ariaLabel = "Channel source",
}: {
  mode: TelegramChannelScopeMode;
  onChange: (mode: TelegramChannelScopeMode) => void;
  ariaLabel?: string;
}) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onChange}
      ariaLabel={ariaLabel}
      options={[
        { value: "network", label: "Network" },
        { value: "channels", label: "Channels" },
      ]}
    />
  );
}

export function TelegramChannelScopeSelector({
  mode,
  selectedNetworkId,
  selectedChannelIds,
  networks,
  channels,
  onModeChange,
  onNetworkChange,
  onChannelsChange,
  label = "Channel source",
  channelsPlaceholder = "Choose channels",
}: {
  mode: TelegramChannelScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onModeChange: (mode: TelegramChannelScopeMode) => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  label?: string;
  channelsPlaceholder?: string;
}) {
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-300">{label}</span>
        <TelegramChannelScopeModeToggle mode={mode} onChange={onModeChange} />
      </div>
      <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
        {mode === "network" ? (
          <CustomSelect
            value={selectedNetworkId}
            onChange={onNetworkChange}
            placeholder="Choose network"
            options={networks.map((network) => ({
              value: network.id,
              label: network.name,
              iconUrl:
                network.iconPresentation?.type === "image"
                  ? network.iconPresentation.url
                  : undefined,
              iconEmoji:
                network.iconPresentation?.type === "unicode"
                  ? network.iconPresentation.value
                  : undefined,
              iconFallback: network.name,
            }))}
          />
        ) : (
          <MultiSelect
            value={selectedChannelIds}
            onChange={onChannelsChange}
            placeholder={channelsPlaceholder}
            options={channels.map((channel) => ({
              value: channel.id,
              label: channel.username
                ? `${channel.title} (@${channel.username})`
                : channel.title,
              selectedLabel: channel.title,
              iconUrl: channel.photoUrl,
              iconFallback: channel.title,
            }))}
          />
        )}
      </div>
    </div>
  );
}
