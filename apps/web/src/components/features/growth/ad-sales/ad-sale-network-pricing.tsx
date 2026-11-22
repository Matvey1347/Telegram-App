"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { allocateTelegramAdSalesTotalPrice } from "@telegram-system/shared";
import { FormField, Input } from "@/components/ui/primitives";
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
      setMode("total");
      setTotalPrice(value);
      // For one channel, the total is the placement price. Previously this
      // field changed only the allocation target, leaving the actual placement
      // at its old quote; the mismatch correctly disabled Create sale but gave
      // the user no useful way to resolve it.
      if (placements.length !== 1) return;
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
  onTotalPriceChange,
}: {
  mode: "total" | "per-placement";
  totalPrice: string;
  recommendedTotal: number;
  allocatedTotal: number;
  currency: string;
  placementCount: number;
  quotesReady: boolean;
  onTotalPriceChange: (value: string) => void;
}) {
  return (
    <section className="min-w-0">
      <FormField label="Sale total" required>
        <div className="relative">
          <Input
            value={mode === "per-placement" ? allocatedTotal.toFixed(2) : totalPrice}
            inputMode="decimal"
            disabled={!placementCount || !quotesReady}
            onChange={(event) => onTotalPriceChange(event.target.value)}
            className="pr-16"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-sm text-neutral-400">
            {currency}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500" aria-live="polite">
          {!placementCount
            ? "Select placements to set the sale total."
            : quotesReady
              ? `Recommended price for ${placementCount} placement${placementCount === 1 ? "" : "s"}: ${recommendedTotal.toFixed(2)} ${currency}`
              : "Calculating recommended price…"}
        </p>
      </FormField>
    </section>
  );
}
