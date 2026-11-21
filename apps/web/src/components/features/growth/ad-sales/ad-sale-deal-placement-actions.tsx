"use client";

import { useMemo, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { Pencil, Settings2 } from "lucide-react";
import { Button, CustomSelect, DateInput, TimeInput } from "@/components/ui/primitives";
import { isValidTimeInputValue } from "@/components/ui/time-input";
import { publicWebEnvironment } from "@/config/public-env";
import { commonAdSaleFormats } from "./ad-sale-placement-draft";
import { channelLocalDateKey, channelLocalTime } from "@/lib/features/growth/telegram-ad-sales";

export type AdSaleApplyAllChanges = {
  formatName?: string;
  date?: string;
  time?: string;
};

type OperatorPlacementAction = "publish" | "reconcile-published";

export function AdSaleDealPlacementActions({
  sale,
  productsByChannelId,
  saving,
  onApplyAll,
  onSharedPost,
  onOperatorAction,
}: {
  sale: TelegramAdSale;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  saving: boolean;
  onApplyAll: (changes: AdSaleApplyAllChanges) => Promise<void>;
  onSharedPost?: () => void;
  onOperatorAction?: (action: OperatorPlacementAction, placement: TelegramAdSale["placements"][number]) => Promise<void>;
}) {
  const [formatName, setFormatName] = useState("");
  const firstPlacement = sale.placements[0];
  const [operatorError, setOperatorError] = useState("");
  const [operatorBusy, setOperatorBusy] = useState(false);
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
  const commonSelectedFormat = useMemo(() => {
    const names = sale.placements.map((placement) => {
      const productId = placement.telegramAdProductId;
      return productsByChannelId[placement.telegramChannelId]?.find(
        (product) => product.id === productId,
      )?.name ?? "";
    });
    return names.length && names[0] && names.every((name) => name === names[0])
      ? names[0]
      : "";
  }, [productsByChannelId, sale.placements]);
  const canEditSharedPost =
    Boolean(onSharedPost) &&
    sale.placements.length > 1 &&
    sale.placements.every(
      (placement) => placement.managedPostId && placement.managedPost,
    );
  const selectedFormat = formatName || commonSelectedFormat;
  const hasChanges = Boolean(formatName || dateChanged || timeChanged);

  if (publicWebEnvironment.liveMode === "operator") {
    const post = firstPlacement?.managedPost;
    if (sale.placements.length !== 1 || !post || !onOperatorAction) return null;
    const editable = post.status === "DRAFT" || post.status === "SCHEDULED";
    const action = editable ? "publish" : "reconcile-published";
    const submit = async () => {
      setOperatorBusy(true);
      setOperatorError("");
      try {
        await onOperatorAction(action, firstPlacement);
      } catch (error) {
        setOperatorError(error instanceof Error ? error.message : "Operator action failed.");
      } finally {
        setOperatorBusy(false);
      }
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        {editable && onSharedPost && <Button onClick={onSharedPost}>Edit selected post</Button>}
        <Button disabled={operatorBusy} onClick={() => void submit()}>
          {editable ? "Publish selected placement" : "Reconcile publication"}
        </Button>
        {operatorError && <p role="alert">{operatorError}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid w-full grid-cols-2 gap-2 lg:grid-cols-[minmax(9rem,1fr)_minmax(8rem,1fr)_minmax(6rem,0.7fr)_auto_auto] lg:items-end">
        {formats.length ? (
          <div className="min-w-0">
            <span className="mb-1 block text-xs text-neutral-400">Format</span>
            <CustomSelect
              aria-label="Format for all placements"
              value={selectedFormat}
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
        <label className="min-w-0 space-y-1">
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
        <label className="min-w-0 space-y-1">
          <span className="block text-xs text-neutral-400">Time for all</span>
          <TimeInput
            aria-label="Time for all"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              setTimeChanged(true);
            }}
            className="h-10 w-full"
          />
        </label>
        <Button
          className="w-full sm:w-auto"
          variant="primary"
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
        {canEditSharedPost ? (
          <Button className="w-full lg:w-auto" onClick={onSharedPost}>
            <span className="inline-flex items-center gap-2">
              <Pencil size={16} aria-hidden="true" />
              Edit shared post
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
