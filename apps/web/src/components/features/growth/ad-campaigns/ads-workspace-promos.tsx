"use client";

import { type Promo } from "@/lib/api";
import {
  EmptyState,
  LoadingState,
  MasonryGrid,
} from "@/components/ui/primitives";
import { PromoCard } from "@/components/features/growth/ad-campaigns/promo-card";

export function PromosSection({
  promos,
  loading,
  error,
  onEdit,
  onDelete,
  onToggleArchive,
}: {
  promos: Promo[];
  loading: boolean;
  error: unknown;
  onEdit: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
  onToggleArchive: (promo: Promo) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load promos.
        </div>
      ) : null}
      {!loading && !error && !promos.length ? (
        <EmptyState text="No promos yet." />
      ) : null}
      {promos.length ? (
        <MasonryGrid className="xl:grid-cols-4">
          {promos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              onEdit={() => onEdit(promo)}
              onDelete={() => onDelete(promo)}
              onToggleArchive={() => onToggleArchive(promo)}
            />
          ))}
        </MasonryGrid>
      ) : null}
    </>
  );
}
