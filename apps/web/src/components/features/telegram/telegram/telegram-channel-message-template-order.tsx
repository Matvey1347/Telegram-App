"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type {
  TelegramMessageTemplateChannelSource,
  TelegramMessageTemplateGroupMode,
} from "@telegram-system/shared";
import { Input, Select } from "@/components/ui/primitives";

export function TelegramChannelMessageTemplateOrder({
  channels,
  groupChannels,
  groupMode,
  groupLabels,
  groupHeaderTemplate,
  onOrderChange,
  onGroupChannelsChange,
  onGroupModeChange,
  onGroupLabelsChange,
  onGroupHeaderTemplateChange,
}: {
  channels: TelegramMessageTemplateChannelSource[];
  groupChannels: boolean;
  groupMode: TelegramMessageTemplateGroupMode;
  groupLabels: Record<string, string>;
  groupHeaderTemplate: string;
  onOrderChange: (ids: string[]) => void;
  onGroupChannelsChange: (enabled: boolean) => void;
  onGroupModeChange: (value: TelegramMessageTemplateGroupMode) => void;
  onGroupLabelsChange: (labels: Record<string, string>) => void;
  onGroupHeaderTemplateChange: (value: string) => void;
}) {
  const networkLabel = (channel: TelegramMessageTemplateChannelSource) =>
    channel.networkGroups[0]?.name || "No network";
  const groupLabel = (channel: TelegramMessageTemplateChannelSource) =>
    groupLabels[channel.id]?.trim() ||
    (groupMode === "NETWORK" ? networkLabel(channel) : "");
  const move = (channelId: string, direction: -1 | 1) => {
    const ids = channels.map((channel) => channel.id);
    const index = ids.indexOf(channelId);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    onOrderChange(ids);
  };
  const networkGroups = channels.reduce<
    Array<{ label: string; channels: TelegramMessageTemplateChannelSource[] }>
  >((groups, channel) => {
    const label = groupLabel(channel);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.channels.push(channel);
    else groups.push({ label, channels: [channel] });
    return groups;
  }, []);
  const moveGroup = (groupIndex: number, direction: -1 | 1) => {
    const groups = [...networkGroups];
    [groups[groupIndex], groups[groupIndex + direction]] = [
      groups[groupIndex + direction],
      groups[groupIndex],
    ];
    onOrderChange(
      groups.flatMap((group) => group.channels.map((channel) => channel.id)),
    );
  };
  const setGroupingMode = (value: TelegramMessageTemplateGroupMode) => {
    if (value === "NETWORK") {
      onGroupLabelsChange(
        Object.fromEntries(
          channels.map((channel) => [channel.id, networkLabel(channel)]),
        ),
      );
    }
    onGroupModeChange(value);
  };
  const renderChannel = (channel: TelegramMessageTemplateChannelSource) => {
    const index = channels.findIndex((item) => item.id === channel.id);
    return (
      <li
        key={channel.id}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 px-2 py-1.5"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
          {channel.emojiSource} {channel.title}
        </span>
        {groupChannels && groupMode === "CUSTOM" ? (
          <Input
            aria-label={`Group for ${channel.title}`}
            className="w-36"
            maxLength={80}
            placeholder="Group, e.g. Business"
            value={groupLabels[channel.id] || ""}
            onChange={(event) =>
              onGroupLabelsChange({
                ...groupLabels,
                [channel.id]: event.target.value,
              })
            }
          />
        ) : null}
        <button
          type="button"
          aria-label={`Move ${channel.title} up`}
          title="Move up"
          disabled={index === 0}
          onClick={() => move(channel.id, -1)}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Move ${channel.title} down`}
          title="Move down"
          disabled={index === channels.length - 1}
          onClick={() => move(channel.id, 1)}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"
        >
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div>
        <h3 className="text-sm font-medium text-white">Channel order</h3>
        <p className="text-xs text-neutral-400">
          Move channels into the order you want in the message.
        </p>
      </div>
      {groupChannels && groupMode === "NETWORK" ? (
        <div className="space-y-2">
          {networkGroups.map((group, groupIndex) => {
            const first = group.channels[0];
            const groupIds = group.channels.map((channel) => channel.id);
            return (
              <section
                key={groupIds.join(":")}
                className="space-y-1.5 rounded-lg border border-neutral-800 p-2"
              >
                <label className="flex items-center gap-2 text-sm text-neutral-200">
                  <span aria-hidden="true">
                    {first.networkGroups[0]?.emojiSource || "📂"}
                  </span>
                  <Input
                    aria-label={`Group name for ${group.label}`}
                    className="h-8 flex-1"
                    maxLength={80}
                    value={group.label}
                    onChange={(event) =>
                      onGroupLabelsChange({
                        ...groupLabels,
                        ...Object.fromEntries(
                          groupIds.map((id) => [id, event.target.value]),
                        ),
                      })
                    }
                  />
                  <span className="text-xs text-neutral-500">
                    {group.channels.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${group.label} group up`}
                    title="Move group up"
                    disabled={groupIndex === 0}
                    onClick={() => moveGroup(groupIndex, -1)}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${group.label} group down`}
                    title="Move group down"
                    disabled={groupIndex === networkGroups.length - 1}
                    onClick={() => moveGroup(groupIndex, 1)}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                </label>
                <ol className="space-y-1.5">
                  {group.channels.map(renderChannel)}
                </ol>
              </section>
            );
          })}
        </div>
      ) : (
        <ol className="space-y-1.5">{channels.map(renderChannel)}</ol>
      )}
      <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-blue-500"
          checked={groupChannels}
          onChange={(event) => onGroupChannelsChange(event.target.checked)}
        />
        <span>
          Group channels
          <span className="block text-xs text-neutral-400">
            Keep related channels together under a heading.
          </span>
        </span>
      </label>
      {groupChannels ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-neutral-400">
            Group by
            <Select
              aria-label="Group channels by"
              className="mt-1"
              value={groupMode}
              onChange={(event) =>
                setGroupingMode(
                  event.target.value as TelegramMessageTemplateGroupMode,
                )
              }
            >
              <option value="NETWORK">Network</option>
              <option value="CUSTOM">Custom name</option>
            </Select>
          </label>
          <label className="text-xs text-neutral-400">
            Group heading
            <Input
              aria-label="Group heading"
              className="mt-1"
              maxLength={160}
              placeholder="{{group}} — {{count}} saved channels"
              value={groupHeaderTemplate}
              onChange={(event) =>
                onGroupHeaderTemplateChange(event.target.value)
              }
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
