"use client";

import type { AdCampaignTrackingChannel } from "@telegram-system/shared";
import { CustomSelect, FormField } from "@/components/ui/primitives";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

type TrackingKind = {
  kind: string;
  label: string;
  channels: AdCampaignTrackingChannel[];
};

export function CampaignTrackingEditor({
  allChannels, kinds, hasError, kind, channelId, selectedIds,
  onKindChange, onScopeChange, endedAt,
}: {
  allChannels: boolean;
  kinds: TrackingKind[];
  hasError: boolean;
  kind: string;
  channelId: string;
  selectedIds: string[];
  onKindChange: (kind: string) => void;
  onScopeChange: (all: boolean, ids: string[]) => void;
  endedAt?: string;
}) {
  const channels = (kinds.find((item) => item.kind === kind)?.channels ?? [])
    .filter((channel) => channel.id !== channelId);
  const unavailable = channels.filter((channel) =>
    !channel.hasSystemLink && (allChannels || selectedIds.includes(channel.id)),
  );

  return (
    <div className="space-y-2">
      <p className="text-sm">{allChannels ? "All channels" : "Selected channels"} · {kinds.find((item) => item.kind === kind)?.label ?? kind}</p>
      {endedAt ? (
        <p className="text-xs text-muted-foreground">Tracking ended on {endedAt}.</p>
      ) : (
        <p className="text-xs text-muted-foreground">The tracking end date is recorded when Telegram confirms an approval batch for the campaign.</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm">Edit tracking</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <FormField label="System link">
            <CustomSelect
              value={kind}
              onChange={onKindChange}
              options={kinds.map((item) => ({ value: item.kind, label: item.label }))}
            />
          </FormField>
          <FormField label="Channel selection">
            <CustomSelect
              value={allChannels ? "all" : "selected"}
              onChange={(value) => onScopeChange(value === "all", value === "all" ? [] : channels.map(({ id }) => id))}
              options={[{ value: "all", label: "All channels" }, { value: "selected", label: "Select channels" }]}
            />
          </FormField>
          {!allChannels && (
            <div className="sm:col-span-2"><FormField label="Destination channels">
              <CampaignMultiValueSelect
                value={selectedIds.filter((id) => id !== channelId)}
                onChange={(ids) => onScopeChange(false, ids)}
                placeholder="Select channels"
                options={channels.map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  description: channel.hasSystemLink ? undefined : "System link not configured",
                  iconUrl: channel.photoUrl ?? undefined,
                  iconFallback: channel.title,
                }))}
              />
            </FormField></div>
          )}
        </div>
        {allChannels && unavailable.length > 0 && (
          <ul aria-label="Channels awaiting a system link" className="mt-2 text-xs text-muted-foreground">
            {unavailable.map(({ id, title }) => <li key={id}>{title}</li>)}
          </ul>
        )}
      </details>
      {unavailable.length > 0 && <p className="text-xs text-muted-foreground">Channels awaiting a system link: {unavailable.length}</p>}
      {hasError && <p role="alert" className="text-sm text-rose-300">Could not load system link settings.</p>}
    </div>
  );
}
