"use client";

import { useMemo, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { Pencil } from "lucide-react";
import { Button, CustomSelect, DateInput, TimeInput } from "@/components/ui/primitives";
import { publicWebEnvironment } from "@/config/public-env";
import { commonAdSaleFormats } from "./ad-sale-placement-draft";
import type { PlacementDraft } from "./ad-sales-sale-detail-editors";

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
  drafts,
  onSharedPost,
  onOperatorAction,
}: {
  sale: TelegramAdSale;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  saving: boolean;
  onApplyAll: (changes: AdSaleApplyAllChanges) => void;
  drafts: PlacementDraft[];
  onSharedPost?: () => void;
  onOperatorAction?: (action: OperatorPlacementAction, placement: TelegramAdSale["placements"][number]) => Promise<void>;
}) {
  const firstPlacement = sale.placements[0];
  const [operatorError, setOperatorError] = useState("");
  const [operatorBusy, setOperatorBusy] = useState(false);
  const date = drafts[0]?.date ?? "";
  const time = drafts[0]?.time ?? "";
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
      const productId = drafts.find((draft) => draft.id === placement.id)?.telegramAdProductId;
      return productsByChannelId[placement.telegramChannelId]?.find(
        (product) => product.id === productId,
      )?.name ?? "";
    });
    return names.length && names[0] && names.every((name) => name === names[0])
      ? names[0]
      : "";
  }, [drafts, productsByChannelId, sale.placements]);
  const canEditSharedPost =
    Boolean(onSharedPost) &&
    sale.placements.length > 1 &&
    sale.placements.every(
      (placement) => placement.managedPostId && placement.managedPost,
    );
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
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:items-end">
        {formats.length ? (
          <div className="min-w-0">
            <span className="mb-1 block text-xs text-neutral-400">Format</span>
            <CustomSelect
              aria-label="Format for all placements"
              value={commonSelectedFormat}
              onChange={(formatName) => { if (formatName) onApplyAll({ formatName }); }}
              disabled={saving}
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
            disabled={saving}
            onChange={(event) => onApplyAll({ date: event.target.value })}
            className="h-10 min-h-0 w-full"
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="block text-xs text-neutral-400">Time for all</span>
          <TimeInput
            aria-label="Time for all"
            value={time}
            disabled={saving}
            onChange={(event) => onApplyAll({ time: event.target.value })}
            className="h-10 w-full"
          />
        </label>
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
