"use client";

import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import {
  Button,
  CustomSelect,
  ErrorState,
  LoadingState,
  Modal,
  MultiSelect,
} from "@/components/ui/primitives";
import {
  AdSaleScopeModeToggle,
  type AdSaleScopeMode,
} from "./ad-sale-placement-scope";

export function AdSalesInventoryModal({
  open,
  loading,
  error,
  selectionMode,
  selectedNetworkId,
  selectedChannelIds,
  networks,
  channels,
  onClose,
  onSelectionModeChange,
  onNetworkChange,
  onChannelsChange,
}: {
  open: boolean;
  loading: boolean;
  error: unknown;
  selectionMode: AdSaleScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onClose: () => void;
  onSelectionModeChange: (mode: AdSaleScopeMode) => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
}) {
  const allNetwork = networks.find((network) => network.systemKey === "ALL");
  const networkOptions = [
    ...(allNetwork
      ? [allNetwork]
      : [
          {
            id: "",
            name: "All",
            systemKey: "ALL" as const,
            iconPresentation: { type: "unicode" as const, value: "🌐" },
          },
        ]),
    ...networks.filter((network) => network.systemKey !== "ALL"),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inventory"
      size="md"
      allowOverflow
    >
      <div className="space-y-5 pt-1">
        <p className="text-sm text-neutral-400">
          Choose which channels or network to use for inventory, slots, and
          analytics.
        </p>

        {loading && !channels.length && !networks.length ? (
          <LoadingState text="Loading inventory…" />
        ) : error ? (
          <ErrorState text="Could not load inventory options." />
        ) : (
          <div className="space-y-3">
            <AdSaleScopeModeToggle
              mode={selectionMode}
              onChange={onSelectionModeChange}
            />
            <div className="min-h-[42px]">
              {selectionMode === "network" ? (
                <CustomSelect
                  value={selectedNetworkId || allNetwork?.id || ""}
                  onChange={onNetworkChange}
                  placeholder="All networks"
                  dropdownClassName="z-[70]"
                  options={networkOptions.map((network) => ({
                    value: network.id,
                    label: network.systemKey === "ALL" ? "All" : network.name,
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
                  placeholder="Choose channels"
                  allSelectedLabel="All channels"
                  className="z-[60]"
                  options={channels.map((channel) => ({
                    value: channel.id,
                    label: channel.title,
                    selectedLabel: channel.title,
                    iconUrl: channel.photoUrl,
                    iconFallback: channel.title,
                  }))}
                />
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-neutral-800 pt-4">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
