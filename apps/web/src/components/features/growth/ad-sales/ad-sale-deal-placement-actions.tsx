"use client";

import { useMemo, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { Pencil, Settings2 } from "lucide-react";
import { Button, CustomSelect, DateInput, TimeInput } from "@/components/ui/primitives";
import { isValidTimeInputValue } from "@/components/ui/time-input";
import { commonAdSaleFormats } from "./ad-sale-placement-draft";
import { channelLocalDateKey, channelLocalTime } from "@/lib/features/growth/telegram-ad-sales";

export type AdSaleApplyAllChanges = {
  formatName?: string;
  date?: string;
  time?: string;
};

export function AdSaleDealPlacementActions({
  sale,
  productsByChannelId,
  saving,
  onApplyAll,
  onSharedPost,
}: {
  sale: TelegramAdSale;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  saving: boolean;
  onApplyAll: (changes: AdSaleApplyAllChanges) => Promise<void>;
  onSharedPost?: () => void;
}) {
  const [formatName, setFormatName] = useState("");
  const firstPlacement = sale.placements[0];
  const [date, setDate] = useState(() =>
    firstPlacement
      ? channelLocalDateKey(firstPlacement.scheduledAt, firstPlacement.timezone)
      : "",
  );
  const [time, setTime] = useState(() =>
    firstPlacement
      ? channelLocalTime(firstPlacement.scheduledAt, firstPlacement.timezone)
      : "",
  );
  const [dateChanged, setDateChanged] = useState(false);
  const [timeChanged, setTimeChanged] = useState(false);
  const formats = useMemo(
    () =>
      commonAdSaleFormats({
        channelIds: sale.placements.map((placement) => placement.telegramChannelId),
        productsByChannelId,
      }),
    [productsByChannelId, sale.placements],
  );
  const canEditSharedPost =
    Boolean(onSharedPost) &&
    sale.placements.length > 1 &&
    sale.placements.every(
      (placement) => placement.managedPostId && placement.managedPost,
    );
  const hasChanges = Boolean(formatName || dateChanged || timeChanged);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
        {formats.length ? (
          <div className="min-w-36">
            <span className="mb-1 block text-xs text-neutral-400">Format</span>
            <CustomSelect
              aria-label="Format for all placements"
              value={formatName}
              onChange={setFormatName}
              options={[
                { value: "", label: "Format for all" },
                ...formats.map((format) => ({
                  value: format.name,
                  label: format.name,
                })),
              ]}
            />
          </div>
        ) : null}
        <label className="min-w-32 flex-1 space-y-1">
          <span className="block text-xs text-neutral-400">Date for all</span>
          <DateInput
            id={`ad-sale-date-for-all-${sale.id}`}
            aria-label="Date for all"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setDateChanged(true);
            }}
            className="h-10 min-h-0 w-full"
          />
        </label>
        <label className="w-28 space-y-1">
          <span className="block text-xs text-neutral-400">Time for all</span>
          <TimeInput
            aria-label="Time for all"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              setTimeChanged(true);
            }}
            className="h-10"
          />
        </label>
        <Button
          variant="secondary"
          disabled={
            !hasChanges ||
            saving ||
            (dateChanged && !date) ||
            (timeChanged && !isValidTimeInputValue(time))
          }
          onClick={() =>
            void onApplyAll({
              ...(formatName ? { formatName } : {}),
              ...(dateChanged ? { date } : {}),
              ...(timeChanged ? { time } : {}),
            })
          }
        >
          <span className="inline-flex items-center gap-2">
            <Settings2 size={16} aria-hidden="true" />
            Apply all ({sale.placements.length})
          </span>
        </Button>
      </div>
      {canEditSharedPost ? (
        <Button className="w-full sm:w-auto" onClick={onSharedPost}>
          <span className="inline-flex items-center gap-2">
            <Pencil size={16} aria-hidden="true" />
            Edit shared post
          </span>
        </Button>
      ) : null}
    </div>
  );
}
