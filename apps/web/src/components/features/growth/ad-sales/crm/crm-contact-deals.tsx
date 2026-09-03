"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CrmContactDetail } from "@telegram-system/shared";
import { SalesTab } from "../ad-sales-sales-tab";
import { telegramAdSalesApi, telegramChannelsApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { telegramChannelKeys } from "@/lib/query-keys";

export function CrmContactDeals({ contact }: { contact: CrmContactDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const params = {
    advertiserId: contact.id,
    page,
    pageSize,
    search: search.trim() || undefined,
  };
  const sales = useQuery({
    queryKey: telegramAdSalesKeys.list(params),
    queryFn: ({ signal }) => telegramAdSalesApi.listSalesPage(params, signal),
    placeholderData: keepPreviousData,
  });
  const channels = useQuery({
    queryKey: telegramChannelKeys.list(),
    queryFn: telegramChannelsApi.list,
    staleTime: 60_000,
  });

  return (
    <SalesTab
      sales={sales.data?.items ?? []}
      channels={channels.data ?? []}
      loading={sales.isLoading || sales.isPlaceholderData}
      error={sales.error || channels.error}
      page={sales.data?.pagination.page ?? page}
      pageSize={sales.data?.pagination.pageSize ?? pageSize}
      pagination={sales.data?.pagination}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPage(1);
        setPageSize(size);
      }}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      settings={undefined}
      rates={undefined}
      onOpenSale={(saleId) =>
        router.push(`/ad-sales/sales?saleId=${encodeURIComponent(saleId)}`)
      }
      onDeleteSale={async (sale) => {
        await telegramAdSalesApi.deleteSale(sale.id);
        await queryClient.invalidateQueries({
          queryKey: telegramAdSalesKeys.listRoot(),
        });
      }}
    />
  );
}
