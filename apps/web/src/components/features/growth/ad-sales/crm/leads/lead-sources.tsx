"use client";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/lib/features/growth/lead-discovery-query";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { LeadSourceCard, sourceState } from "./lead-source-card";
import { LeadSourceStatus } from "./lead-source-status";
import { LeadQueryState } from "./lead-query-state";
export function LeadSources({
  workspace,
  config,
}: {
  workspace: string;
  config: LeadDiscoveryConfig;
}) {
  const client = useQueryClient();
  const ru = useOptionalI18n()?.locale !== "en";
  const [filter, setFilter] = useState<LeadSourceListFilter>({ limit: 50 });
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: "observedPosts" | "advertisements" | "uniqueCandidates"; direction: "asc" | "desc" } | null>(null);
  const query = useInfiniteQuery({
    queryKey: leadKeys.sources(workspace, filter),
    queryFn: async ({ signal }) => {
      const items = [] as import("@telegram-system/shared").LeadSourceView[];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await leadDiscoveryApi.sources({ ...filter, cursor }, signal);
        items.push(...page.items);
        if (!page.hasMore) break;
        if (!page.nextCursor || seen.has(page.nextCursor) || items.length >= config.maxSources) throw new Error("Invalid source cursor");
        seen.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (true);
      return { items, hasMore: false, nextCursor: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    ...leadQueryPolicy,
  });
  const items = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => !status || (status === "ACTIVE" ? sourceState(item).label === "Активен" : sourceState(item).label !== "Активен"));
  if (sort) items.sort((a, b) => (sort.direction === "desc" ? -1 : 1) * (a.metrics[sort.key] - b.metrics[sort.key]));
  const columns = [
    { label: ru ? "Канал" : "Channel" }, { label: ru ? "Тематика" : "Topic" },
    { label: ru ? "Публикации" : "Posts", key: "observedPosts" as const },
    { label: ru ? "Реклама" : "Ads", key: "advertisements" as const },
    { label: ru ? "Кандидаты" : "Candidates", key: "uniqueCandidates" as const },
    { label: ru ? "Статус" : "Status" }, { label: ru ? "Обновлён" : "Updated" }, { label: ru ? "Действия" : "Actions" },
  ];
  const refreshAll = useMutation({
    retry: false,
    mutationFn: async () => {
      const sources = [] as typeof items;
      let cursor: string | undefined;
      const cursors = new Set<string>();
      do {
        const page = await leadDiscoveryApi.sources({ limit: 50, cursor });
        sources.push(...page.items);
        if (!page.hasMore) break;
        if (sources.length >= config.maxSources) throw new Error("Source limit exceeded");
        if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error("Invalid source cursor");
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (true);
      let updated = 0, failed = 0, skipped = 0;
      for (const source of sources) {
        if (!source.accountId || !source.channelId || source.monitoringState === "DISABLED") { skipped++; continue; }
        try { await leadDiscoveryApi.scan(source.id); updated++; } catch { failed++; }
      }
      return { updated, failed, skipped };
    },
    onSettled: () => invalidateLeadResults(client, workspace),
  });
  return (
    <section className="min-w-0 space-y-4">
      {refreshAll.data ? <p role="status" className="text-xs text-neutral-400">{ru ? `Обновлено: ${refreshAll.data.updated} · Ошибок: ${refreshAll.data.failed} · Пропущено: ${refreshAll.data.skipped}` : `Updated: ${refreshAll.data.updated} · Errors: ${refreshAll.data.failed} · Skipped: ${refreshAll.data.skipped}`}</p> : null}
      {refreshAll.isError ? <p role="alert" className="text-xs text-amber-200">Не удалось получить список всех каналов. Повторите обновление.</p> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setFilter({ limit: 50, search: String(f.get("search") ?? "") || undefined });
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
      <p className="text-xs text-neutral-500">{ru ? "Обновление проверяет до 50 последних публикаций каждого подключённого канала. Полная история и анализ зависят от настроек и разрешений источника." : "Refresh checks up to 50 recent posts per connected channel. Full history and analysis depend on source settings and permissions."}</p>
      <LeadQueryState
        loading={query.isLoading}
        error={query.isError}
        empty={query.isSuccess && !items.length}
        onRetry={() => void query.refetch()}
      />
      {items.length ? <div className="overflow-x-auto rounded-xl border border-neutral-800"><table className="w-full min-w-[980px] text-left"><thead className="bg-neutral-900/80 text-xs text-neutral-400"><tr>{columns.map(({ label, key }) => <th key={label} scope="col" aria-sort={key && sort?.key === key ? (sort.direction === "desc" ? "descending" : "ascending") : undefined} className="whitespace-nowrap px-4 py-3 font-medium">{key ? <button type="button" className="inline-flex items-center gap-1 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => setSort((current) => ({ key, direction: current?.key === key && current.direction === "desc" ? "asc" : "desc" }))}>{label}{sort?.key === key ? (sort.direction === "desc" ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUp size={14} aria-hidden="true" />) : <ArrowUpDown size={14} aria-hidden="true" />}</button> : label}</th>)}</tr></thead><tbody>{items.map((source) => <LeadSourceCard key={source.id} source={source} canManage={config.canManage} enabled={config.enabled} />)}</tbody></table></div> : null}
    </section>
  );
}
