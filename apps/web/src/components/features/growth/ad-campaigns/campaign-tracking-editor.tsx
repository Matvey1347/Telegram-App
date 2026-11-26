"use client";

import { useState } from "react";
import { Bot, ChevronDown, Globe, Link2, Megaphone, Network, Repeat2, Settings2 } from "lucide-react";
import type { AdCampaignTrackingChannel } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button, CustomSelect, FormField } from "@/components/ui/primitives";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

type TrackingKind = {
  kind: string;
  label: string;
  channels: AdCampaignTrackingChannel[];
};

const all = "__all_channels";
const icons = { MAIN: Link2, PUBLIC: Globe, BOT: Bot, BROADCAST: Megaphone, TRANSFER: Repeat2, VP: Network };

export function CampaignTrackingEditor({
  allChannels, kinds, hasError, kind, channelId, selectedIds,
  onKindChange, onScopeChange,
}: {
  allChannels: boolean;
  kinds: TrackingKind[];
  hasError: boolean;
  kind: string;
  channelId: string;
  selectedIds: string[];
  onKindChange: (kind: string) => void;
  onScopeChange: (all: boolean, ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const channels = (kinds.find((item) => item.kind === kind)?.channels ?? [])
    .filter((channel) => channel.id !== channelId);
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Settings2 size={16} aria-hidden /> Edit tracking
        <ChevronDown size={14} aria-hidden className={expanded ? "rotate-180" : undefined} />
      </Button>
      {expanded && (
        <div className="grid gap-3 rounded-lg border border-neutral-800 p-3 sm:grid-cols-2">
          <FormField label="System link">
            <CustomSelect
              ariaLabel="System link"
              value={kind}
              onChange={onKindChange}
              options={kinds.map((item) => {
                const Icon = icons[item.kind as keyof typeof icons] ?? Link2;
                return { value: item.kind, label: item.label, icon: <Icon size={16} aria-hidden /> };
              })}
            />
          </FormField>
          <FormField label="Destination channels">
            <CampaignMultiValueSelect
              value={allChannels ? [all] : selectedIds.filter((id) => id !== channelId)}
              placeholder="All channels"
              onChange={(ids) => {
                const specific = ids.filter((id) => id !== all);
                const selectAll = !ids.length || (!allChannels && ids.includes(all));
                onScopeChange(selectAll, selectAll ? [] : specific);
              }}
              options={[
                { value: all, label: "All channels", icon: <Network size={16} aria-hidden /> },
                ...channels.map((channel) => ({
                  value: channel.id, label: channel.title,
                  icon: <span aria-hidden><IconAvatar
                    size="xs" label={channel.title}
                    icon={channel.avatarPresentation ?? (channel.photoUrl
                      ? { type: "image", id: channel.id, url: channel.photoUrl }
                      : null)}
                  /></span>,
                })),
              ]}
            />
          </FormField>
        </div>
      )}
      {expanded && hasError && <p role="alert" className="text-sm text-rose-300">Could not load system link settings.</p>}
    </div>
  );
}
