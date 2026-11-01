"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  LeadDiscoveryConfig,
  LeadSourceListFilter,
} from "@telegram-system/shared";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { LeadSourceCard } from "./lead-source-card";
import { LeadSourceForm } from "./lead-source-form";
import { LeadQueryState } from "./lead-query-state";
export function LeadSources({
  workspace,
  config,
}: {
  workspace: string;
  config: LeadDiscoveryConfig;
}) {
  const t = useLeadText();
  const [filter, setFilter] = useState<LeadSourceListFilter>({ limit: 50 });
  const [status, setStatus] = useState("");
  const [add, setAdd] = useState(false);
  const query = useInfiniteQuery({
    queryKey: leadKeys.sources(workspace, filter),
    queryFn: ({ pageParam, signal }) =>
      leadDiscoveryApi.sources({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    ...leadQueryPolicy,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2">
        {config.canManage ? (
          <>
            <Button
              className="max-w-full !whitespace-normal"
              onClick={() => setAdd(true)}
            >
              {t("Add source")}
            </Button>

          </>
        ) : null}
      </div>
      <details className="rounded-lg border border-neutral-800 px-3 py-2">
        <summary className="cursor-pointer text-sm text-neutral-300">Найти источник</summary>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilter({
            limit: 50,
            search: String(f.get("search") ?? "") || undefined,
            status: status || undefined,
          });
        }}
      >
        <FormField label={t("Search sources")}>
          <Input
            name="search"
            aria-label={t("Search sources")}
            maxLength={100}
            placeholder={t("Source name or identifier")}
          />
        </FormField>
        <FormField label={t("Source status")}>
          <Select
            name="status"
            aria-label={t("Source status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("All statuses")}</option>
            {[
              "ACTIVE",
              "LOW_YIELD",
              "NO_ADS_30D",
              "INSUFFICIENT_COVERAGE",
              "PAUSED",
              "ACCESS_LOST",
              "DISABLED",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <Button
          className="max-w-full !whitespace-normal"
          type="submit"
          variant="secondary"
        >
          {t("Apply source filters")}
        </Button>
      </form>
      </details>
      <LeadQueryState
        loading={query.isLoading}
        error={query.isError}
        empty={query.isSuccess && !items.length}
        onRetry={() => void query.refetch()}
      />
      <div className="grid min-w-0 gap-2 lg:grid-cols-2">
        {items.map((v) => (
          <LeadSourceCard
            key={v.id}
            source={v}
            canManage={config.canManage}
            enabled={config.enabled}
          />
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("Load more sources")}
        </Button>
      ) : null}
      {add ? (
        <LeadSourceForm workspace={workspace} onClose={() => setAdd(false)} />
      ) : null}

    </section>
  );
}
