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
    if (mode !== "total" || totalEdited || recommendedTotal <= 0) return;
    // Keep the untouched total synchronized with asynchronously loaded quotes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotalPrice(String(Number(recommendedTotal.toFixed(2))));
  }, [mode, recommendedTotal, totalEdited]);

  useEffect(() => {
    const total = toNumber(totalPrice);
    if (mode !== "total" || total <= 0 || !placements.length) return;
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
  onModeChange,
  onTotalPriceChange,
}: {
  mode: "total" | "per-placement";
  totalPrice: string;
  recommendedTotal: number;
  allocatedTotal: number;
  currency: string;
  placementCount: number;
  onModeChange: (mode: "total" | "per-placement") => void;
  onTotalPriceChange: (value: string) => void;
}) {
  const exact =
    Math.round(toNumber(totalPrice) * 100) === Math.round(allocatedTotal * 100);
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">Network sale price</p>
          <p className="text-xs text-neutral-400">
            The total is split by each placement&apos;s expected value (views ×
            CPM).
          </p>
        </div>
        <div className="inline-grid shrink-0 grid-cols-2 rounded-md border border-neutral-700 bg-neutral-950 p-px">
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
        </div>
      </div>
      {mode === "total" ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <FormField label="Sold total" required>
            <Input
              value={totalPrice}
              inputMode="decimal"
              onChange={(event) => onTotalPriceChange(event.target.value)}
            />
          </FormField>
          <Summary
            label="Calculated total"
            value={`${recommendedTotal.toFixed(2)} ${currency}`}
          />
          <Summary
            label={`Allocated to ${placementCount} placements`}
            value={`${allocatedTotal.toFixed(2)} ${currency}`}
            tone={exact ? "ok" : "error"}
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
