"use client";

import { useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { consumerFinanceInvestmentsApi } from "@/lib/features/finance/consumer-finance-investments-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";

export function useFinanceInvestmentHistories(
  botId: string,
  investmentId: string,
) {
  const client = useQueryClient();
  const cashFlowBootstrapped = useRef(new Set<string>());
  const valuationBootstrapped = useRef(new Set<string>());
  const bootstrapId = `${botId}:${investmentId}`;
  const detailKey = consumerFinanceKeys.investment(botId, investmentId);
  const loadDetail = () =>
    consumerFinanceInvestmentsApi.get(botId, investmentId);
  const cashFlows = useInfiniteQuery({
    queryKey: consumerFinanceKeys.investmentCashFlows(botId, investmentId),
    queryFn: async ({ pageParam }) => {
      if (!pageParam && !cashFlowBootstrapped.current.has(bootstrapId)) {
        const embedded = await client.ensureQueryData({
          queryKey: detailKey,
          queryFn: loadDetail,
          retry: false,
        });
        cashFlowBootstrapped.current.add(bootstrapId);
        return embedded.cashFlows;
      }
      return consumerFinanceInvestmentsApi.cashFlows(botId, investmentId, {
        cursor: pageParam,
        limit: 30,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const valuations = useInfiniteQuery({
    queryKey: consumerFinanceKeys.investmentValuations(botId, investmentId),
    queryFn: async ({ pageParam }) => {
      if (!pageParam && !valuationBootstrapped.current.has(bootstrapId)) {
        const embedded = await client.ensureQueryData({
          queryKey: detailKey,
          queryFn: loadDetail,
          retry: false,
        });
        valuationBootstrapped.current.add(bootstrapId);
        return embedded.valuations;
      }
      return consumerFinanceInvestmentsApi.valuations(botId, investmentId, {
        cursor: pageParam,
        limit: 30,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  return { cashFlows, valuations };
}
