"use client";

import { useQuery } from "@tanstack/react-query";
import { promosApi, type Promo } from "@/lib/api";

export function usePromoDeepLink(
  promoId: string,
  enabled: boolean,
  visiblePromos: Promo[],
) {
  return useQuery({
    queryKey: ["promos", "detail", promoId],
    queryFn: () => promosApi.get(promoId),
    enabled:
      enabled &&
      Boolean(promoId) &&
      !visiblePromos.some((promo) => promo.id === promoId),
  });
}
