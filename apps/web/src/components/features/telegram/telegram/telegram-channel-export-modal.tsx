"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TELEGRAM_CHANNEL_EXPORT_SECTIONS,
  type TelegramChannelExportSection,
} from "@telegram-system/shared";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { Button, Modal } from "@/components/ui/primitives";
import {
  resolveTelegramChannelScopeIds,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "./telegram-channel-scope-selector";

export type TelegramChannelExportSelection = {
  channelIds: string[];
  sections: TelegramChannelExportSection[];
};

export function TelegramChannelExportModal({
  open,
  channels,
  networks,
  defaultChannelIds,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  defaultChannelIds: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (selection: TelegramChannelExportSelection) => void;
}) {
  const [mode, setMode] = useState<TelegramChannelScopeMode>("channels");
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [sections, setSections] = useState<TelegramChannelExportSection[]>([
    ...TELEGRAM_CHANNEL_EXPORT_SECTIONS,
  ]);

  useEffect(() => {
    if (!open) return;
    // This is an intentional reset when a new export dialog session opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("channels");
    setSelectedNetworkId("");
    setSelectedChannelIds(
      defaultChannelIds.length
        ? defaultChannelIds
        : channels.map((channel) => channel.id),
    );
    setSections([...TELEGRAM_CHANNEL_EXPORT_SECTIONS]);
  }, [channels, defaultChannelIds, open]);

  const resolvedChannelIds = useMemo(
    () =>
      resolveTelegramChannelScopeIds({
        mode,
        selectedNetworkId,
        selectedChannelIds,
        networks,
      }),
    [mode, networks, selectedChannelIds, selectedNetworkId],
  );

  const sectionOptions: Array<{
    id: TelegramChannelExportSection;
    title: string;
    description: string;
  }> = [
    { id: "channel_profile", title: "Channel profile", description: "Identity, settings, data sources and access." },
    { id: "ads", title: "Ads", description: "Creatives, ad campaigns and advertising networks." },
    { id: "crm", title: "CRM", description: "Clients, deals, placement posts and payments for this channel." },
    { id: "finance", title: "Finance", description: "Every transaction attributed to this channel." },
    { id: "channel_stats", title: "Channel stats", description: "Posts, post metrics and current calculated channel metrics." },
    { id: "channel_dynamics", title: "Channel dynamics", description: "Daily, audience and graph history for every available period." },
    { id: "traffic_attribution", title: "Traffic attribution", description: "Invite links, their source group and historical counters." },
  ];

  const toggleSection = (section: TelegramChannelExportSection) => {
    setSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Export channels">
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">
          Choose a network or individual channels, then choose exactly which
          channel data to include. One Excel file is downloaded for each channel.
        </p>
        <TelegramChannelScopeSelector
          mode={mode}
          selectedNetworkId={selectedNetworkId}
          selectedChannelIds={selectedChannelIds}
          networks={networks}
          channels={channels}
          label="Export source"
          channelsPlaceholder="Choose channels to export"
          disabled={isSubmitting}
          onModeChange={setMode}
          onNetworkChange={setSelectedNetworkId}
          onChannelsChange={setSelectedChannelIds}
        />
        <section className="space-y-3 border-t border-neutral-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Data to export</h3>
              <p className="text-xs text-neutral-400">Select all to export every available channel-data section.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={isSubmitting}
              onClick={() => setSections([...TELEGRAM_CHANNEL_EXPORT_SECTIONS])}
            >
              Select all
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sectionOptions.map((section) => {
              const selected = sections.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={isSubmitting}
                  onClick={() => toggleSection(section.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${selected ? "bg-blue-600 text-white" : "border border-neutral-600"}`}>
                      {selected ? "✓" : ""}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-white">{section.title}</span>
                      <span className="block pt-0.5 text-xs text-neutral-400">{section.description}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-4">
          <p className="text-sm text-neutral-400">
            Channels: {resolvedChannelIds.length} · Sections: {sections.length}/{TELEGRAM_CHANNEL_EXPORT_SECTIONS.length}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting || !resolvedChannelIds.length || !sections.length}
              onClick={() => onSubmit({ channelIds: resolvedChannelIds, sections })}
            >
              {isSubmitting ? "Exporting..." : "Export"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
