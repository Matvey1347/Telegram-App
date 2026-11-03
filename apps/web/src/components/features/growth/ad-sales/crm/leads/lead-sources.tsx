"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LeadDiscoveryConfig,
  LeadSourceListFilter,
} from "@telegram-system/shared";
import { Button, CustomSelect, FormField, Input } from "@/components/ui/primitives";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from "lucide-react";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
  invalidateLeadResults,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { useAppToast } from "@/providers/toast-provider";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { LeadSourceCard, sourceState } from "./lead-source-card";
import { LeadSourceStatus } from "./lead-source-status";
import { LeadQueryState } from "./lead-query-state";
import { Pagination } from "@/components/ui/pagination";
export function LeadSources({
  workspace,
  config,
}: {
  workspace: string;
  config: LeadDiscoveryConfig;
}) {
  const client = useQueryClient();
  const { setProgress } = useAppToast();
  const ru = useOptionalI18n()?.locale !== "en";
  const [filter, setFilter] = useState<LeadSourceListFilter>({ limit: 20 });
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: "observedPosts" | "advertisements" | "uniqueCandidates"; direction: "asc" | "desc" } | null>(null);
  const pageFilter = { ...filter, cursor: cursors[pageIndex] };
  const query = useQuery({
    queryKey: leadKeys.sources(workspace, pageFilter),
    queryFn: ({ signal }) => leadDiscoveryApi.sources(pageFilter, signal),
    ...leadQueryPolicy,
  });
  const currentPage = query.data;
  const items = (currentPage?.items ?? []).filter((item) => !status || (status === "ACTIVE" ? sourceState(item).label === "Активен" : sourceState(item).label !== "Активен"));
  if (sort) items.sort((a, b) => (sort.direction === "desc" ? -1 : 1) * (a.metrics[sort.key] - b.metrics[sort.key]));
  const columns = [
    { label: ru ? "Канал" : "Channel" }, { label: ru ? "Тематика" : "Topic" },
    { label: ru ? "Публикации" : "Posts", key: "observedPosts" as const },
    { label: ru ? "Реклама" : "Ads", key: "advertisements" as const },
    { label: ru ? "Взаимопиар" : "Mutual promotion" },
    { label: ru ? "Кандидаты" : "Candidates", key: "uniqueCandidates" as const },
    { label: ru ? "Статус" : "Status" }, { label: ru ? "Обновлён" : "Updated" }, { label: ru ? "Действия" : "Actions" },
  ];
  const refreshAll = useMutation({
    retry: false,
    mutationFn: async () => {
      const id = `lead-refresh:${workspace}`;
      setProgress({ id, title: ru ? "Обновление источников" : "Refreshing sources", message: ru ? "Подготовка каналов…" : "Preparing channels…" });
      try {
        const result = await leadDiscoveryApi.refreshSources((item, current, total) => {
          void patchLeadEntity(client, leadKeys.sourcesRoot(workspace), item.source);
          const metrics = item.source.metrics;
          setProgress({ id, title: ru ? "Обновление источников" : "Refreshing sources", current, total,
            message: `${item.source.title}: ${item.status === "failed" ? (ru ? "ошибка" : "failed") : item.status === "skipped" ? (ru ? "пропущен" : "skipped") : `${ru ? "проверено" : "scanned"} ${item.scanned}, ${ru ? "реклама" : "ads"} ${metrics.advertisements}, ${ru ? "взаимопиар" : "mutual promotion"} ${metrics.mutualPromotions ?? 0}, ${ru ? "кандидаты" : "candidates"} ${metrics.uniqueCandidates}${item.truncated ? " (500+)" : ""}`}` });
        });
        setProgress({ id, title: ru ? "Обновление завершено" : "Refresh complete", completed: true, successCount: result.updated, failedCount: result.failed, skippedCount: result.skipped });
        return result;
      } catch (error) {
        setProgress({ id, title: ru ? "Ошибка обновления" : "Refresh failed", completed: true, failedCount: 1 });
        throw error;
      }
    },
    onSettled: () => invalidateLeadResults(client, workspace),
  });
  return (
    <section className="min-w-0 space-y-4">
      {refreshAll.data ? <p role="status" className="text-xs text-neutral-400">{ru ? `Обновлено: ${refreshAll.data.updated} · Ошибок: ${refreshAll.data.failed} · Пропущено: ${refreshAll.data.skipped}` : `Updated: ${refreshAll.data.updated} · Errors: ${refreshAll.data.failed} · Skipped: ${refreshAll.data.skipped}`}</p> : null}
      {refreshAll.isError ? <p role="alert" className="text-xs text-amber-200">Не удалось обновить каналы. Повторите попытку.</p> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setPageIndex(0);
        setCursors([undefined]);
        setFilter({ limit: 20, search: String(f.get("search") ?? "") || undefined });
      }}>
        <div className="min-w-0 flex-1 sm:min-w-64 sm:max-w-md"><FormField label={ru ? "Поиск источников" : "Search sources"}>
          <Input name="search" maxLength={100} aria-label={ru ? "Поиск источников" : "Search sources"} placeholder={ru ? "Название канала" : "Channel name"} />
        </FormField></div>
        <div className="min-w-44 flex-1"><FormField label={ru ? "Статус" : "Status"}>
          <CustomSelect ariaLabel={ru ? "Статус источника" : "Source status"} value={status} onChange={setStatus} searchable={false} options={[
            { value: "", label: ru ? "Все статусы" : "All statuses" },
            { value: "ACTIVE", label: ru ? "Активные" : "Active", labelContent: <LeadSourceStatus active>{ru ? "Активные" : "Active"}</LeadSourceStatus> },
            { value: "INACTIVE", label: ru ? "Неактивные" : "Inactive", labelContent: <LeadSourceStatus active={false}>{ru ? "Неактивные" : "Inactive"}</LeadSourceStatus> },
          ]} />
        </FormField></div>
        <Button type="submit"><Search size={16} aria-hidden="true" />{ru ? "Найти" : "Search"}</Button>
        {config.canManage ? <Button type="button" variant="secondary" disabled={!config.enabled || refreshAll.isPending} onClick={() => refreshAll.mutate()}><RefreshCw size={16} aria-hidden="true" />{refreshAll.isPending ? (ru ? "Обновляем каналы…" : "Refreshing channels…") : (ru ? "Обновить все каналы" : "Refresh all channels")}</Button> : null}
      </form>
      <LeadQueryState
        loading={query.isLoading}
        error={query.isError}
        empty={query.isSuccess && !items.length}
        onRetry={() => void query.refetch()}
      />
      {items.length ? <div className="overflow-x-auto rounded-xl border border-neutral-800"><table className="w-full min-w-[980px] text-left"><thead className="bg-neutral-900/80 text-xs text-neutral-400"><tr>{columns.map(({ label, key }) => <th key={label} scope="col" aria-sort={key && sort?.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : undefined} className="whitespace-nowrap px-4 py-3 font-medium">{key ? <button type="button" className="inline-flex items-center gap-1 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => setSort((current) => ({ key, direction: current?.key === key && current.direction === "desc" ? "asc" : "desc" }))}>{label}{sort?.key === key ? (sort.direction === "desc" ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUp size={14} aria-hidden="true" />) : <ArrowUpDown size={14} aria-hidden="true" />}</button> : label}</th>)}</tr></thead><tbody>{items.map((source) => <LeadSourceCard key={source.id} source={source} canManage={config.canManage} enabled={config.enabled} />)}</tbody></table></div> : null}
      <Pagination page={pageIndex + 1} pageSize={filter.limit ?? 20} totalItems={query.data?.total ?? (currentPage ? (pageIndex + 1) * (filter.limit ?? 20) + (currentPage.hasMore ? 1 : 0) : 0)} totalPages={Math.max(pageIndex + 1 + (currentPage?.hasMore ? 1 : 0), Math.ceil((query.data?.total ?? 0) / (filter.limit ?? 20)))} hasNextPage={Boolean(currentPage?.hasMore)} hasPreviousPage={pageIndex > 0} loading={query.isFetching} cursorMode onPageChange={(page) => { if (page > pageIndex + 1 && currentPage?.nextCursor) { setCursors((existing) => [...existing.slice(0, pageIndex + 1), currentPage.nextCursor ?? undefined]); setPageIndex(page - 1); } else if (page < pageIndex + 1) setPageIndex(page - 1); }} onPageSizeChange={(limit) => { setPageIndex(0); setCursors([undefined]); setFilter({ ...filter, limit }); }} pageSizeOptions={[20, 50, 100]} />
    </section>
  );
}
