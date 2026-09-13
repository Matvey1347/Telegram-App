"use client";

import { MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT } from "@telegram-system/shared";
import { Input } from "@/components/ui/primitives";

export function ChannelPostSyncLimitField({
  value,
  onChange,
  className = "",
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-neutral-400 ${className}`}>
      <span className="mb-1.5 block font-medium text-neutral-300">
        Posts to sync
      </span>
      <Input
        aria-label="Posts to sync"
        type="number"
        min={1}
        max={MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) =>
          onChange(
            Math.max(
              1,
              Math.min(
                MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT,
                Math.trunc(Number(event.target.value)) || 1,
              ),
            ),
          )
        }
      />
      <span className="mt-1.5 block text-neutral-500">
        From 1 to {MAX_TELEGRAM_CHANNEL_POST_SYNC_LIMIT.toLocaleString()} posts.
        Larger histories take longer to synchronize.
      </span>
    </label>
  );
}
