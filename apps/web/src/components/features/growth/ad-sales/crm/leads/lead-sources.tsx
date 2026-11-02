"use client";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LeadDiscoveryConfig,
  LeadSourceListFilter,
} from "@telegram-system/shared";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
  invalidateLeadResults,
} from "@/lib/features/growth/lead-discovery-query";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { LeadSourceCard, sourceState } from "./lead-source-card";
import { LeadSourceForm } from "./lead-source-form";
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
  const [add, setAdd] = useState(false);
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
      <div className="flex flex-wrap gap-2">
        {config.canManage ? (
          <>
            <Button
              className="max-w-full !whitespace-normal"
              onClick={() => setAdd(true)}
            >
              {ru ? "Добавить источник" : "Add source"}
            </Button>
            <Button variant="secondary" disabled={!config.enabled || refreshAll.isPending} onClick={() => refreshAll.mutate()}>
              {refreshAll.isPending ? "Обновляем каналы…" : "Обновить все каналы"}
            </Button>

          </>
        ) : null}
      </div>
      {refreshAll.data ? <p role="status" className="text-xs text-neutral-400">Обновлено: {refreshAll.data.updated} · Ошибок: {refreshAll.data.failed} · Пропущено: {refreshAll.data.skipped}. Обновление загружает публикации; анализ рекламы запускается отдельно ниже.</p> : null}
      {refreshAll.isError ? <p role="alert" className="text-xs text-amber-200">Не удалось получить список всех каналов. Повторите обновление.</p> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setFilter({ limit: 50, search: String(f.get("search") ?? "") || undefined });
      }}>
        <FormField label={ru ? "Поиск источников" : "Search sources"}>
          <Input name="search" maxLength={100} aria-label={ru ? "Поиск источников" : "Search sources"} placeholder={ru ? "Название канала" : "Channel name"} />
        </FormField>
        <FormField label={ru ? "Статус" : "Status"}>
          <Select aria-label={ru ? "Статус источника" : "Source status"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{ru ? "Все статусы" : "All statuses"}</option>
            <option value="ACTIVE" className="text-emerald-400" data-icon-emoji="🟢">{ru ? "Активные" : "Active"}</option>
            <option value="INACTIVE" className="text-amber-300" data-icon-emoji="🟠">{ru ? "Неактивные" : "Inactive"}</option>
          </Select>
        </FormField>
        <Button type="submit" variant="secondary">{ru ? "Найти" : "Search"}</Button>
      </form>
      <LeadQueryState
        loading={query.isLoading}
        error={query.isError}
        empty={query.isSuccess && !items.length}
        onRetry={() => void query.refetch()}
      />
      {items.length ? <div className="overflow-x-auto rounded-xl border border-neutral-800"><table className="w-full min-w-[980px] text-left"><thead className="bg-neutral-900/80 text-xs text-neutral-400"><tr>{(ru ? ["Канал", "Тематика", "Публикации", "Реклама", "Кандидаты", "Статус", "Обновлён", "Действия"] : ["Channel", "Topic", "Posts", "Ads", "Candidates", "Status", "Updated", "Actions"]).map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{items.map((source) => <LeadSourceCard key={source.id} source={source} canManage={config.canManage} enabled={config.enabled} />)}</tbody></table></div> : null}
      {add ? (
        <LeadSourceForm workspace={workspace} onClose={() => setAdd(false)} />
      ) : null}

    </section>
  );
}
