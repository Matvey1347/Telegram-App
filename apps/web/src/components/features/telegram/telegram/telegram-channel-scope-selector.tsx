"use client";

import type { ResolvedEmoji } from "@/lib/api";
import { CustomSelect, MultiSelect } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type TelegramChannelScopeMode = "network" | "channels";

type ScopeChannel = {
  id: string;
  title: string;
  username?: string | null;
  photoUrl?: string | null;
};

type ScopeNetwork = {
  id: string;
  name: string;
  iconPresentation?: ResolvedEmoji | null;
  channels: Array<{ id: string }>;
};

export function resolveTelegramChannelScopeIds({
  mode,
  selectedNetworkId,
  selectedChannelIds,
  networks,
}: {
  mode: TelegramChannelScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: ScopeNetwork[];
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
  disabled = false,
}: {
  mode: TelegramChannelScopeMode;
  onChange: (mode: TelegramChannelScopeMode) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <SegmentedControl
      value={mode}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
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
  disabled = false,
}: {
  mode: TelegramChannelScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: ScopeNetwork[];
  channels: ScopeChannel[];
  onModeChange: (mode: TelegramChannelScopeMode) => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  label?: string;
  channelsPlaceholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-300">{label}</span>
        <TelegramChannelScopeModeToggle
          mode={mode}
          onChange={onModeChange}
          disabled={disabled}
        />
      </div>
      <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
        {mode === "network" ? (
          <CustomSelect
            disabled={disabled}
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
            disabled={disabled}
            value={selectedChannelIds}
            onChange={onChannelsChange}
            placeholder={channelsPlaceholder}
            options={channels.map((channel) => ({
              value: channel.id,
              label: channel.username
                ? `${channel.title} (@${channel.username})`
                : channel.title,
              selectedLabel: channel.title,
              iconUrl: channel.photoUrl || undefined,
              iconFallback: channel.title,
            }))}
          />
        )}
      </div>
    </div>
  );
}
