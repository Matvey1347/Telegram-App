"use client";

import { useMemo, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { Pencil, Settings2 } from "lucide-react";
import { Button, CustomSelect } from "@/components/ui/primitives";
import { commonAdSaleFormats } from "./ad-sale-placement-draft";

export function AdSaleDealPlacementActions({
  sale,
  productsByChannelId,
  saving,
  onApplyFormat,
  onSharedPost,
}: {
  sale: TelegramAdSale;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  saving: boolean;
  onApplyFormat: (formatName: string) => Promise<void>;
  onSharedPost?: () => void;
}) {
  const [formatName, setFormatName] = useState("");
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

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      {formats.length ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
          <Button
            variant="secondary"
            disabled={!formatName || saving}
            onClick={() => void onApplyFormat(formatName)}
          >
            <span className="inline-flex items-center gap-2">
              <Settings2 size={16} aria-hidden="true" />
              Apply to all ({sale.placements.length})
            </span>
          </Button>
        </div>
      ) : null}
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
