"use client";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { LeadPreparationQueueInput } from "@telegram-system/shared";
import { Button, Card, FormField, Input, Select } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { leadKeys, leadQueryPolicy } from "@/lib/features/growth/lead-discovery-query";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { LeadCandidateContent } from "./lead-candidate-details";
import { LeadQueryState } from "./lead-query-state";
import { useQualificationText } from "./qualification-copy";

export function LeadCandidates({ workspace, canReview, compact = false, externalSearch }: { workspace: string; canReview: boolean; compact?: boolean; externalSearch?: string }) {
  const t = useQualificationText();
  const ru = useOptionalI18n()?.locale !== "en";
  const [filter, setFilter] = useState<LeadPreparationQueueInput>({ limit: 50 });
  const [details, setDetails] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const effective = compact ? { ...filter, search: externalSearch || undefined } : filter;
  const query = useInfiniteQuery({
    queryKey: leadKeys.queue(workspace, effective),
    queryFn: ({ pageParam, signal }) => leadPreparationApi.queue({ ...effective, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    ...leadQueryPolicy,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const detail = useQuery({
    queryKey: leadKeys.candidate(workspace, details ?? ""),
    queryFn: ({ signal }) => leadDiscoveryApi.candidate(details!, signal),
    enabled: !!details, ...leadQueryPolicy, staleTime: 0,
  });
  return <section className="min-w-0 space-y-4">
    {!compact ? <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      setFilter({ ...filter, search: String(fields.get("search") ?? "").trim() || undefined });
    }}>
      <div className="min-w-64 flex-1"><FormField label={t("Search candidates")}><Input name="search" maxLength={100} aria-label={t("Search candidates")} placeholder={ru ? "Название проекта или контакт" : "Project or contact"} /></FormField></div>
      <div className="min-w-52 flex-1"><FormField label={ru ? "Статус" : "Status"}><Select aria-label={t("Workflow")} value={filter.workflow ?? ""} onChange={(event) => setFilter({ ...filter, workflow: (event.target.value || undefined) as LeadPreparationQueueInput["workflow"] })}>
        <option value="">{t("All candidates")}</option><option value="NEW">{t("NEW")}</option><option value="NEEDS_REVIEW">{t("NEEDS_REVIEW")}</option><option value="REJECTED">{t("REJECTED")}</option><option value="LINKED">{t("LINKED")}</option>
      </Select></FormField></div>
      <Button type="submit"><Search size={16} aria-hidden="true" />{ru ? "Найти" : "Search"}</Button>
    </form> : null}
    <div className={compact ? "grid min-w-0 gap-4" : "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(15rem,.8fr)_minmax(0,2.2fr)]"}>
      <div className={`min-w-0 space-y-3 ${details ? (compact ? "hidden" : "hidden xl:block") : ""}`}>
        <LeadQueryState loading={query.isLoading} error={query.isError} empty={query.isSuccess && !items.length} onRetry={() => void query.refetch()} />
        {query.isSuccess ? <p className="text-xs text-neutral-400">{ru ? "Найдено" : "Found"}: {query.data?.pages[0]?.total ?? items.length}</p> : null}
        {items.map((candidate) => {
          const username = /^@([a-z][a-z0-9_]{3,31})$/i.exec(candidate.title)?.[1];
          const avatar = username ? { type: "image" as const, id: username, url: `https://t.me/i/userpic/320/${username}.jpg` } : null;
          return <Card key={candidate.id} className={details === candidate.id ? "!border-blue-700 !bg-blue-950/20" : ""}>
            <button className="flex min-h-11 w-full items-center gap-3 text-left" aria-label={candidate.title} aria-pressed={details === candidate.id} onClick={(event) => { opener.current = event.currentTarget; setDetails(candidate.id); requestAnimationFrame(() => { heading.current?.focus(); if (window.innerWidth < 1280) heading.current?.scrollIntoView?.({ block: "start" }); }); }}>
              <IconAvatar icon={avatar} label={candidate.title} size="md" className="!rounded-full" decorative />
              <span className="min-w-0"><span className="block break-all text-sm font-semibold text-blue-200">{candidate.title}</span><span className="mt-1 block break-words text-xs text-neutral-400">{ru ? "Источник" : "Source"}: {candidate.sources.map((source) => source.title).join(", ") || (ru ? "не указан" : "not specified")}</span></span>
            </button>
          </Card>;
        })}
        {query.hasNextPage ? <Button variant="secondary" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t("Load more candidates")}</Button> : null}
      </div>
      {details ? <div className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 ref={heading} tabIndex={-1} className="min-w-0 scroll-mt-20 break-words text-lg font-semibold outline-none">{detail.data?.title ?? t("Candidate details")}</h2><Button variant="secondary" onClick={() => { setDetails(null); requestAnimationFrame(() => opener.current?.focus()); }}>{t("Back to candidates")}</Button></div>
        <LeadQueryState loading={detail.isLoading} error={detail.isError} empty={false} onRetry={() => void detail.refetch()} />
        {detail.data ? <LeadCandidateContent key={detail.data.id} candidate={detail.data} canReview={canReview} simplified onReload={() => void detail.refetch()} /> : null}
      </div> : <div className={compact ? "hidden" : "hidden min-h-52 place-items-center rounded-xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-400 xl:grid"}>{ru ? "Выберите кандидата, чтобы посмотреть подробности" : "Select a candidate to view details"}</div>}
    </div>
  </section>;
}
