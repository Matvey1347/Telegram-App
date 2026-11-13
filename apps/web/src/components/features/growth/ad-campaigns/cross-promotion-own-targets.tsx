"use client";

import type { CrossPromotionTargetInput } from "@telegram-system/shared";
import type { Promo, TelegramChannel, TelegramInviteLinkOption } from "@/lib/api";
import { DateInput, FormField, MultiSelect, TimeInput } from "@/components/ui/primitives";
import { CrossPromotionTargetEditor } from "./cross-promotion-target-editor";
import { CommonAdSlotOptions } from "../common-ad-slot-options";

export function CrossPromotionOwnTargets({
  channels,
  publisherIds,
  targetIds,
  date,
  time,
  onDateChange,
  onTimeChange,
  targets,
  onTargetIdsChange,
  onTargetsChange,
  onResolved,
}: {
  channels: TelegramChannel[];
  publisherIds: string[];
  targetIds: string[];
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  targets: CrossPromotionTargetInput[];
  onTargetIdsChange: (ids: string[]) => void;
  onTargetsChange: (targets: CrossPromotionTargetInput[]) => void;
  onResolved: (
    channelId: string,
    value: { promo?: Promo; inviteLink?: TelegramInviteLinkOption },
  ) => void;
}) {
  const available = channels.filter(
    (channel) => !publisherIds.includes(channel.id),
  );
  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Publication date" required>
          <DateInput value={date} onChange={(event) => onDateChange(event.currentTarget.value)} />
        </FormField>
        <FormField label="Publication time" required>
          <TimeInput value={time} onChange={(event) => onTimeChange(event.currentTarget.value)} />
          <CommonAdSlotOptions channelIds={publisherIds} date={date} selectedTime={time} onSelect={onTimeChange} />
        </FormField>
      </div>
      <FormField label="Channels being promoted" required>
        <MultiSelect
          value={targetIds}
          onChange={onTargetIdsChange}
          options={available.map((channel) => ({
            value: channel.id,
            label: channel.username
              ? `${channel.title} · @${channel.username}`
              : channel.title,
            selectedLabel: channel.title,
            iconUrl: channel.photoUrl,
            iconFallback: channel.title,
          }))}
          placeholder="Select promoted channels"
          searchPlaceholder="Search your channels"
        />
      </FormField>
      {targets.map((target) => {
        const channel = channels.find(
          (item) => item.id === target.telegramChannelId,
        );
        return channel ? (
          <CrossPromotionTargetEditor
            key={channel.id}
            channel={channel}
            value={target}
            onChange={(next) =>
              onTargetsChange(
                targets.map((item) =>
                  item.telegramChannelId === channel.id ? next : item,
                ),
              )
            }
            onResolved={(value) => onResolved(channel.id, value)}
          />
        ) : null;
      })}
    </section>
  );
}
