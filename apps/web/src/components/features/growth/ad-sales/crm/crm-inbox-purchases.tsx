"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CircleDollarSign, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { formatDateTime } from "@/lib/date-format";
import { useCrmSalesCopy } from "./crm-sales-copy";
import { CrmContactRevenue } from "./crm-contact-card-support";

export function CrmInboxPurchases({ contactId, conversationId, workspaceId }: { contactId: string; conversationId: string; workspaceId: string }) {
  const t = useCrmSalesCopy();
  const sales = useInfiniteQuery({
    queryKey: telegramCrmKeys.purchases(contactId),
    queryFn: ({ pageParam, signal }) => crmSalesWorkflowApi.purchases(contactId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
    staleTime: 60_000,
  });
  const summary = sales.data?.pages[0]?.summary;
  const items = [...new Map(sales.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]) ?? []).values()];
  if (sales.isLoading) return <p role="status" className="text-xs text-neutral-400">{t("crmSales.loadingPurchases")}</p>;
  if (sales.error) return <div role="alert" className="space-y-2"><p>{t("crmSales.purchaseError")}</p><Button variant="secondary" onClick={() => void sales.refetch()}>{t("crmSales.retry")}</Button></div>;
  const returnTo = `/ad-sales/inbox?${new URLSearchParams({ conversationId, workspaceId, details: "1" })}`;
  return <div className="space-y-3">
    {summary && summary.dealCount > 1 ? <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-2 text-xs text-neutral-400"><CircleDollarSign size={15} aria-hidden />{t("crmSales.purchases")}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5 font-semibold text-neutral-100"><span>{summary.dealCount} ·</span><CrmContactRevenue amounts={summary.receivedByCurrency} /></div>
      {summary.lastPurchaseAt ? <p className="mt-1 text-xs text-neutral-500">{t("crmSales.lastPurchase")}: {formatDateTime(summary.lastPurchaseAt)}</p> : null}
    </div> : null}
    {!items.length ? <p className="text-xs text-neutral-500">{t("crmSales.noPurchases")}</p> : null}
    {items.map((sale) => {
      const channels = [...new Set(sale.placements.map((placement) => placement.channel.title))];
      return <Link key={sale.id} href={`/ad-sales/sales?${new URLSearchParams({ saleId: sale.id, returnTo })}`} className="block min-w-0 rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 transition hover:border-neutral-500 hover:bg-neutral-800/60">
        <span className="flex items-start gap-2"><CircleDollarSign size={17} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate font-medium text-neutral-100">{sale.title || t("crmSales.openDeal")}</span><span className="mt-1 block text-xs text-neutral-400">{formatDateTime(sale.createdAt)}</span></span><ChevronRight size={16} className="shrink-0 text-neutral-500" aria-hidden /></span>
        {channels.length ? <span className="mt-2 block truncate text-xs text-neutral-400" title={channels.join(" · ")}>{channels.join(" · ")}</span> : null}
        <span className="mt-2 block text-sm font-semibold text-neutral-100"><CrmContactRevenue amounts={sale.receivedByCurrency} /></span>
      </Link>;
    })}
    {sales.hasNextPage ? <Button variant="secondary" className="w-full" disabled={sales.isFetchingNextPage} onClick={() => void sales.fetchNextPage()}>{t("crmSales.loadMore")}</Button> : null}
  </div>;
}
