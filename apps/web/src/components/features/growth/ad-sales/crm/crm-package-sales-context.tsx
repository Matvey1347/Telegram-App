"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/primitives";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { formatDateTime } from "@/lib/date-format";
import { useCrmSalesCopy } from "./crm-sales-copy";

export function CrmPackageSalesContext() {
  const t = useCrmSalesCopy();
  const query = useInfiniteQuery({ queryKey: telegramCrmKeys.packageSalesContext(),
    queryFn: ({ pageParam, signal }) => crmSalesWorkflowApi.packages(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined, staleTime: 60_000 });
  const initial = query.data?.pages[0];
  const products = [...new Map(query.data?.pages.flatMap((page) => page.products).map((product) => [product.id, product]) ?? []).values()];
  if (query.isLoading) return <p role="status" className="text-xs text-neutral-400">{t("crmSales.loading")}</p>;
  if (query.error) return <div role="alert" className="space-y-2"><p>{t("crmSales.packageError")}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t("crmSales.retry")}</Button></div>;
  return <div className="space-y-4 text-xs">
    <p className="leading-5 text-neutral-400">{t("crmSales.packageHint")}</p>
    {initial ? <p className="text-neutral-500">{t("crmSales.asOf", { date: formatDateTime(initial.asOf) })}</p> : null}
    {initial?.networks.map((network) => <div key={network.id} className="space-y-1"><p className="font-medium text-neutral-200">{network.name}</p><p className="break-words text-neutral-400">{network.channels.map((channel) => channel.title).join(" · ")}</p>{network.channelsTruncated ? <p className="text-amber-300">{t("crmSales.channelsTruncated")}</p> : null}</div>)}
    {initial?.networksTruncated ? <p className="text-amber-300">{t("crmSales.networksTruncated")}</p> : null}
    {!products.length ? <p className="text-neutral-500">{t("crmSales.noProducts")}</p> : null}
    {products.map((product) => <article key={product.id} className="space-y-2 border-t border-neutral-800 pt-3">
      <p className="break-words font-medium text-neutral-200">{product.name} · {product.channel.title}</p>
      <p>{t("crmSales.price")}: {product.fixedPrice === null ? t("crmSales.notRecorded") : `${product.fixedPrice} ${product.currency}`}</p>
      {product.cpm !== null ? <p>CPM: {product.cpm} {product.currency}</p> : null}
      {product.minimumPrice !== null ? <p>{t("crmSales.minimum")}: {product.minimumPrice} {product.currency}</p> : null}
      {product.quoteRequired ? <p className="text-amber-300">{t("crmSales.quoteRequired")}</p> : null}
      {product.constraints ? <p className="break-words text-neutral-400">{t("crmSales.constraints", { ads: product.constraints.maxAdsPerDay, hours: product.constraints.minHoursBetweenAds, days: product.constraints.minDaysBetweenAds })} · {product.constraints.timezone}</p> : <p className="text-neutral-500">{t("crmSales.noConstraints")}</p>}
      {product.isPermanent ? <p>{t("crmSales.permanent")}</p> : null}
      <p className="text-neutral-500">{t("crmSales.asOf", { date: formatDateTime(product.updatedAt) })}</p>
    </article>)}
    {query.hasNextPage ? <Button variant="secondary" className="w-full" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t("crmSales.loadMore")}</Button> : null}
  </div>;
}
