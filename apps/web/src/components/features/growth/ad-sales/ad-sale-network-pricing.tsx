"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { allocateTelegramAdSalesTotalPrice } from "@telegram-system/shared";
import { Button, FormField, Input } from "@/components/ui/primitives";
import { toNumber } from "@/lib/features/growth/telegram-ad-sales";
import type { SalePlacementDraft } from "./ad-sale-types";

export type AdSalePriceAllocation = {
  mode: "PROPORTIONAL_BY_AUDIENCE";
  totalAmount: number;
};

export function useAdSaleNetworkPricing({
  open,
  placements,
  setPlacements,
}: {
  open: boolean;
  placements: SalePlacementDraft[];
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [mode, setMode] = useState<"total" | "per-placement">("total");
  const [totalPrice, setTotalPrice] = useState("");
  const [totalEdited, setTotalEdited] = useState(false);
  const recommendedTotal = useMemo(
    () =>
      placements.reduce(
        (sum, item) => sum + toNumber(item.recommendedPrice),
        0,
      ),
    [placements],
  );

  useEffect(() => {
    if (!open) return;
    // Reset the form-owned pricing session whenever the parent modal opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("total");
    setTotalPrice("");
    setTotalEdited(false);
  }, [open]);

  useEffect(() => {
    if (
      mode !== "total" ||
      recommendedTotal <= 0 ||
      (totalEdited && placements.length > 1)
    )
      return;
    // Keep the untouched total synchronized with asynchronously loaded quotes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotalPrice(String(Number(recommendedTotal.toFixed(2))));
  }, [mode, placements.length, recommendedTotal, totalEdited]);

  useEffect(() => {
    // A previous multi-placement allocation marks its shares as manually
    // edited. Once the user returns to one placement, that old share must not
    // survive a fresh catalog quote and be shown as the current channel price.
    if (
      mode !== "total" ||
      totalEdited ||
      placements.length !== 1 ||
      recommendedTotal <= 0
    )
      return;
    const nextPrice = String(Number(recommendedTotal.toFixed(2)));
    setPlacements((current) => {
      const placement = current[0];
      if (!placement || (placement.agreedPrice === nextPrice && !placement.agreedPriceManuallyEdited)) {
        return current;
      }
      return [
        {
          ...placement,
          agreedPrice: nextPrice,
          agreedPriceManuallyEdited: false,
        },
      ];
    });
  }, [mode, placements.length, recommendedTotal, setPlacements, totalEdited]);

  useEffect(() => {
    const total = toNumber(totalPrice);
    // A single placement has no allocation to calculate. Updating it here
    // would mark the seed price as manually edited and prevent the async,
    // currency-converted quote from replacing it.
    if (mode !== "total" || total <= 0 || placements.length < 2) return;
    try {
      const shares = new Map(
        allocateTelegramAdSalesTotalPrice(
          total,
          placements.map((placement) => ({
            key: placement.key,
            // The quote already combines expected views with the channel/product
            // CPM (or its fixed-price equivalent), so it is the correct value
            // weight for a discounted network total.
            weight: toNumber(placement.recommendedPrice),
          })),
        ).map((share) => [share.key, share.amount] as const),
      );
      setPlacements((current) => {
        let changed = false;
        const next = current.map((placement) => {
          const amount = shares.get(placement.key);
          if (amount == null || toNumber(placement.agreedPrice) === amount)
            return placement;
          changed = true;
          return {
            ...placement,
            agreedPrice: String(amount),
            agreedPriceManuallyEdited: true,
          };
        });
        return changed ? next : current;
      });
    } catch {
      // Validation is shown below and the server remains authoritative.
    }
  }, [mode, placements, setPlacements, totalPrice]);

  const allocatedTotal = placements.reduce(
    (sum, placement) => sum + toNumber(placement.agreedPrice),
    0,
  );
  const total = toNumber(totalPrice);
  const allocation =
    mode === "total" && total > 0
      ? ({ mode: "PROPORTIONAL_BY_AUDIENCE", totalAmount: total } as const)
      : undefined;

  return {
    mode,
    totalPrice,
    recommendedTotal,
    allocatedTotal,
    allocation,
    setTotalPrice: (value: string) => {
      setTotalEdited(true);
      setTotalPrice(value);
      // For one channel, the total is the placement price. Previously this
      // field changed only the allocation target, leaving the actual placement
      // at its old quote; the mismatch correctly disabled Create sale but gave
      // the user no useful way to resolve it.
      if (mode !== "total" || placements.length !== 1) return;
      setPlacements((current) => {
        const placement = current[0];
        if (!placement || placement.agreedPrice === value) return current;
        return [
          {
            ...placement,
            agreedPrice: value,
            agreedPriceManuallyEdited: true,
          },
        ];
      });
    },
    setMode,
  };
}

export function AdSaleNetworkPricing({
  mode,
  totalPrice,
  recommendedTotal,
  allocatedTotal,
  currency,
  placementCount,
  quotesReady,
  onModeChange,
  onTotalPriceChange,
}: {
  mode: "total" | "per-placement";
  totalPrice: string;
  recommendedTotal: number;
  allocatedTotal: number;
  currency: string;
  placementCount: number;
  quotesReady: boolean;
  onModeChange: (mode: "total" | "per-placement") => void;
  onTotalPriceChange: (value: string) => void;
}) {
  const exact =
    Math.round(toNumber(totalPrice) * 100) === Math.round(allocatedTotal * 100);
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">
            {placementCount === 1 ? "Channel sale price" : "Network sale price"}
          </p>
          <p className="text-xs text-neutral-400">
            {placementCount === 1
              ? "Set the agreed price for this channel."
              : "The total is split by each placement's expected value (views × CPM)."}
          </p>
        </div>
        {placementCount > 1 ? <div className="inline-grid shrink-0 grid-cols-2 rounded-md border border-neutral-700 bg-neutral-950 p-px">
          <button
            type="button"
            aria-pressed={mode === "total"}
            className={`h-6 rounded-[5px] px-2 text-[11px] font-medium leading-none transition ${
              mode === "total"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
            onClick={() => onModeChange("total")}
          >
            One total
          </button>
          <button
            type="button"
            aria-pressed={mode === "per-placement"}
            className={`h-6 rounded-[5px] px-2 text-[11px] font-medium leading-none transition ${
              mode === "per-placement"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
            onClick={() => onModeChange("per-placement")}
          >
            Per channel
          </button>
        </div> : null}
      </div>
      {mode === "total" ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <FormField label={placementCount === 1 ? "Sale price" : "Sold total"} required>
            <Input
              value={totalPrice}
              inputMode="decimal"
              disabled={!quotesReady}
              onChange={(event) => onTotalPriceChange(event.target.value)}
            />
          </FormField>
          <Summary
            label={quotesReady ? "Calculated total" : "Channel price quote"}
            value={
              quotesReady
                ? `${recommendedTotal.toFixed(2)} ${currency}`
                : `Refreshing prices in ${currency}…`
            }
          />
          <Summary
            label={quotesReady ? `Allocated to ${placementCount} placements` : "Allocation"}
            value={
              quotesReady
                ? `${allocatedTotal.toFixed(2)} ${currency}`
                : "Waiting for converted quotes…"
            }
            tone={quotesReady ? (exact ? "ok" : "error") : undefined}
          />
        </div>
      ) : null}
    </section>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "error";
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 font-medium tabular-nums ${tone === "error" ? "text-rose-300" : tone === "ok" ? "text-emerald-300" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}
