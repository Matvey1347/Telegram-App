"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Brain, Search, Sparkles, Tag } from "lucide-react";
import type { LeadPreparationQueueInput } from "@telegram-system/shared";
import { Button, Card, FormField, Input, Select } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { leadKeys, leadQueryPolicy } from "@/lib/features/growth/lead-discovery-query";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { LeadCandidateContent } from "./lead-candidate-details";
import { LeadQueryState } from "./lead-query-state";
import { useQualificationText } from "./qualification-copy";
import { LeadSourceFilter } from "./lead-source-filter";

export function LeadCandidates({ workspace, canReview, compact = false, externalSearch }: { workspace: string; canReview: boolean; compact?: boolean; externalSearch?: string }) {
  const t = useQualificationText();
  const ru = useOptionalI18n()?.locale !== "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<LeadPreparationQueueInput>({ limit: 20 });
  const [pageIndex, setPageIndex] = useState(0);
  const [details, setDetails] = useState<string | null>(null);
  const [selectionOverride, setSelectionOverride] = useState<{
    routeCandidate: string | null;
    selectedCandidate: string | null;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const routeCandidate = searchParams.get("candidate");
  const selectedCandidate = compact
    ? details
    : selectionOverride?.routeCandidate === routeCandidate
      ? selectionOverride.selectedCandidate
      : routeCandidate;
  const effective = compact ? { ...filter, search: externalSearch || undefined } : filter;
  const pageFilter = { ...effective, page: pageIndex + 1 };
  const query = useQuery({
    queryKey: leadKeys.queue(workspace, pageFilter),
    queryFn: ({ signal }) => leadPreparationApi.queue(pageFilter, signal),
    ...leadQueryPolicy,
  });
  const currentPage = query.data;
  const items = currentPage?.items ?? [];
  const detail = useQuery({
    queryKey: leadKeys.candidate(workspace, selectedCandidate ?? ""),
    queryFn: ({ signal }) => leadDiscoveryApi.candidate(selectedCandidate!, signal),
    enabled: !!selectedCandidate, ...leadQueryPolicy, staleTime: 0,
  });
  const selectCandidate = (id: string | null) => {
    setDetails(id);
    if (!compact) {
      setSelectionOverride({
        routeCandidate,
        selectedCandidate: id,
      });
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("candidate", id); else params.delete("candidate");
      router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    }
  };
  return <section className="min-w-0 space-y-4">
    {!compact ? <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      setPageIndex(0);
      setFilter({ ...filter, limit: filter.limit ?? 20, cursor: undefined, search: String(fields.get("search") ?? "").trim() || undefined });
    }}>
      <div className="min-w-64 flex-1"><FormField label={t("Search candidates")}><Input name="search" maxLength={100} aria-label={t("Search candidates")} placeholder={ru ? "Название проекта или контакт" : "Project or contact"} /></FormField></div>
      <div className="min-w-52 flex-1"><FormField label={ru ? "Канал" : "Channel"}><LeadSourceFilter workspace={workspace} value={filter.sourceId ?? ""} onChange={(sourceId) => { setPageIndex(0); setFilter({ ...filter, cursor: undefined, sourceId: sourceId || undefined }); }} /></FormField></div>
      <div className="min-w-48"><FormField label={ru ? "Порядок" : "Order"}><Select aria-label={ru ? "Порядок публикаций" : "Publication order"} value={filter.sortDirection ?? "desc"} onChange={(event) => { setPageIndex(0); setFilter({ ...filter, cursor: undefined, sortDirection: event.target.value as "asc" | "desc" }); }}><option value="desc">{ru ? "Сначала новые" : "Newest first"}</option><option value="asc">{ru ? "Сначала старые" : "Oldest first"}</option></Select></FormField></div>
      <Button type="submit"><Search size={16} aria-hidden="true" />{ru ? "Найти" : "Search"}</Button>
    </form> : null}
    <div className={compact ? "grid min-w-0 gap-4" : "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(20rem,1fr)_minmax(0,1.5fr)]"}>
      <div className={`min-w-0 space-y-3 ${selectedCandidate ? (compact ? "hidden" : "hidden xl:block") : ""}`}>
        <LeadQueryState loading={query.isLoading} error={query.isError} empty={query.isSuccess && !items.length} onRetry={() => void query.refetch()} />
        {query.isSuccess ? <p className="text-xs text-neutral-400">{ru ? "Найдено" : "Found"}: {query.data?.total ?? items.length}</p> : null}
        {items.map((candidate) => {
          const target = candidate.contacts.find((contact) => contact.type === "TELEGRAM" && contact.role === "ADVERTISED_DESTINATION");
          const targetValue = target?.value ?? (candidate.title.startsWith("@") ? candidate.title : "");
          const username = /^(?:@|https?:\/\/(?:www\.)?t\.me\/)?([a-z][a-z0-9_]{3,31})\/?$/i.exec(targetValue)?.[1];
          const displayName = username ? `@${username}` : candidate.title;
          const avatar = username ? { type: "image" as const, id: username, url: `https://t.me/i/userpic/320/${username}.jpg` } : null;
          return <Card key={candidate.id} className={selectedCandidate === candidate.id ? "!border-blue-700 !bg-blue-950/20" : ""}>
            <button className="flex min-h-11 w-full items-center gap-3 text-left" aria-label={candidate.title} aria-pressed={selectedCandidate === candidate.id} onClick={(event) => { opener.current = event.currentTarget; selectCandidate(candidate.id); requestAnimationFrame(() => { heading.current?.focus(); if (window.innerWidth < 1280) heading.current?.scrollIntoView?.({ block: "start" }); }); }}>
              <IconAvatar icon={avatar} label={displayName} size="md" className="!rounded-full" decorative />
              <span className="min-w-0"><span className="block break-all text-sm font-semibold text-blue-200">{displayName}</span><span className="mt-1 flex flex-wrap gap-1.5">{candidate.sources.map((source) => { const parts = source.title.split(" · "); const topic = parts.length > 1 ? parts.slice(0, -1).join(" · ") : "—"; const channel = parts.at(-1) ?? source.title; const Topic = /псих|psych/i.test(topic) ? Brain : /(?:^|\s)(?:ии|ai|ші)(?:\s|$)/i.test(topic) ? Sparkles : Tag; const sourceAvatar = source.username && /^[a-z][a-z0-9_]{3,31}$/i.test(source.username) ? { type: "image" as const, id: source.username, url: `https://t.me/i/userpic/320/${source.username}.jpg` } : null; return <span key={source.id} className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-300"><IconAvatar icon={sourceAvatar} label={channel} size="xs" className="!rounded-full" decorative /><Topic size={13} className="text-blue-300" aria-hidden="true" /><span>{topic} · {channel}</span></span>; })}{!candidate.sources.length ? <span className="text-xs text-neutral-400">{ru ? "Источник не указан" : "Source not specified"}</span> : null}<span className="inline-flex items-center text-xs text-neutral-400">{new Intl.DateTimeFormat(ru ? "ru-RU" : "en", { dateStyle: "medium" }).format(new Date(candidate.latestPublishedAt ?? candidate.createdAt))}</span></span></span>
            </button>
          </Card>;
        })}
        <Pagination page={pageIndex + 1} pageSize={filter.limit ?? 20} totalItems={query.data?.total ?? 0} totalPages={Math.max(1, Math.ceil((query.data?.total ?? 0) / (filter.limit ?? 20)))} hasNextPage={Boolean(currentPage?.hasMore)} hasPreviousPage={pageIndex > 0} loading={query.isFetching} cursorMode onPageChange={(page) => setPageIndex(page - 1)} onPageSizeChange={(limit) => { setPageIndex(0); setFilter({ ...filter, limit, cursor: undefined }); }} pageSizeOptions={[20, 50, 100]} />
      </div>
      {selectedCandidate ? <div className="min-w-0 space-y-4"><h2 ref={heading} tabIndex={-1} className="min-w-0 scroll-mt-20 break-words text-lg font-semibold outline-none">{detail.data?.title ?? t("Candidate details")}</h2>
        <LeadQueryState loading={detail.isLoading} error={detail.isError} empty={false} onRetry={() => void detail.refetch()} />
        {detail.data ? <LeadCandidateContent key={detail.data.id} candidate={detail.data} canReview={canReview} onReload={() => void detail.refetch()} /> : null}
      </div> : <div className={compact ? "hidden" : "hidden min-h-52 place-items-center rounded-xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-400 xl:grid"}>{ru ? "Выберите кандидата, чтобы посмотреть подробности" : "Select a candidate to view details"}</div>}
    </div>
  </section>;
}
