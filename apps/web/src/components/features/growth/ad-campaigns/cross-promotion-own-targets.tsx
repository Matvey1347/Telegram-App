"use client";

import type { CrossPromotionTargetInput } from "@telegram-system/shared";
import type { Promo, TelegramChannel, TelegramInviteLink } from "@/lib/api";
import { FormField, MultiSelect } from "@/components/ui/primitives";
import { CrossPromotionTargetEditor } from "./cross-promotion-target-editor";

export function CrossPromotionOwnTargets({
  channels,
  publisherIds,
  targetIds,
  targets,
  onTargetIdsChange,
  onTargetsChange,
  onResolved,
}: {
  channels: TelegramChannel[];
  publisherIds: string[];
  targetIds: string[];
  targets: CrossPromotionTargetInput[];
  onTargetIdsChange: (ids: string[]) => void;
  onTargetsChange: (targets: CrossPromotionTargetInput[]) => void;
  onResolved: (
    channelId: string,
    value: { promo?: Promo; inviteLink?: TelegramInviteLink },
  ) => void;
}) {
  const available = channels.filter(
    (channel) => !publisherIds.includes(channel.id),
  );
  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 p-3">
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
