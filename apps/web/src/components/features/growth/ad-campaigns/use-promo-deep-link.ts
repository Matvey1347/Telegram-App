"use client";

import { useQuery } from "@tanstack/react-query";
import { promosApi } from "@/lib/api";

export function usePromoDeepLink(promoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["promos", "detail", promoId],
    queryFn: () => promosApi.get(promoId),
    enabled: enabled && Boolean(promoId),
  });
}
