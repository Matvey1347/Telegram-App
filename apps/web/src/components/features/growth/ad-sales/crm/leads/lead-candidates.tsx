"use client";
import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { LeadPreparationQueueInput } from "@telegram-system/shared";
import {
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { candidateContactCategory, contactCategoryLabel, contactDescription, isBusinessContact } from "./lead-candidate-presentation";
import { LeadCandidateContent } from "./lead-candidate-details";
import { LeadQueryState } from "./lead-query-state";
import { useQualificationText } from "./qualification-copy";
const workflows = [
  "NEW",
  "NEEDS_REVIEW",
  "QUALIFIED",
  "LOW_RELEVANCE",
  "HIGH_PRIORITY",
  "SUSPICIOUS",
  "REJECTED",
  "LINKED",
] as const;
export function LeadCandidates({
  workspace,
  canReview,
  compact = false,
  externalSearch,
}: {
  workspace: string;
  canReview: boolean;
  compact?: boolean;
  externalSearch?: string;
}) {
  const t = useQualificationText();
  const client = useQueryClient();
  const [filter, setFilter] = useState<LeadPreparationQueueInput>({
    limit: 50,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [limitError, setLimitError] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"APPROVE" | "REJECT" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const effective = compact
    ? { ...filter, search: externalSearch || undefined }
    : filter;
  const query = useInfiniteQuery({
    queryKey: leadKeys.queue(workspace, effective),
    queryFn: ({ pageParam, signal }) =>
      leadPreparationApi.queue({ ...effective, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    ...leadQueryPolicy,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const detail = useQuery({
    queryKey: leadKeys.candidate(workspace, details ?? ""),
    queryFn: ({ signal }) => leadDiscoveryApi.candidate(details!, signal),
    enabled: !!details,
    ...leadQueryPolicy,
    staleTime: 0,
  });
  const review = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT") =>
      leadDiscoveryApi.reviewCandidates(selected, action),
    retry: false,
    onSuccess: async (result) => {
      for (const item of result.items) {
        await patchLeadEntity(client, leadKeys.candidatesRoot(workspace), item);
        client.setQueryData(leadKeys.candidate(workspace, item.id), item);
      }
      setSelected([]);
      setConfirm(null);
      void client.invalidateQueries({
        queryKey: leadKeys.queueRoot(workspace),
      });
      void client.invalidateQueries({
        queryKey: leadKeys.sourcesRoot(workspace),
      });
      if (details)
        void client.invalidateQueries({
          queryKey: leadKeys.preparation(workspace, details),
          exact: true,
        });
    },
  });
  return (
    <section className="min-w-0 space-y-4">
      <div className={details ? (compact ? "hidden" : "hidden space-y-4 xl:block") : "space-y-4"}>
        <p className="text-xs text-neutral-400">
          {t(
            "Review evidence, qualify explicitly, then prepare a first offer. No automatic generation, rejection or outreach.",
          )}
        </p>
        <details className={compact ? "hidden" : "rounded-lg border border-neutral-800 px-3 py-2"}>
          <summary className="cursor-pointer text-sm text-neutral-300">{t("Lead workflow filters")}</summary>
        <div
          className="mt-3 flex flex-wrap gap-2"
          aria-label={t("Lead workflow filters")}
        >
          <Button
            variant={!filter.workflow ? "primary" : "secondary"}
            onClick={() => {
              setFilter({ limit: 50 });
              setSelected([]);
            }}
          >
            {t("All candidates")}
          </Button>
          {workflows.map((v) => (
            <Button
              key={v}
              variant={filter.workflow === v ? "primary" : "secondary"}
              aria-pressed={filter.workflow === v}
              onClick={() => {
                setFilter({ ...filter, workflow: v });
                setSelected([]);
              }}
            >
              {t(v)}
            </Button>
          ))}
        </div>
        </details>
        {!compact ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setFilter({
                ...filter,
                search: String(f.get("search") ?? "") || undefined,
              });
              setSelected([]);
            }}
          >
            <FormField label={t("Search candidates")}>
              <Input
                name="search"
                maxLength={100}
                aria-label={t("Search candidates")}
              />
            </FormField>
            <FormField label={t("Workflow")}>
              <Select
                aria-label={t("Workflow")}
                value={filter.workflow ?? ""}
                onChange={(e) => {
                  setFilter({
                    ...filter,
                    workflow: (e.target.value ||
                      undefined) as LeadPreparationQueueInput["workflow"],
                  });
                  setSelected([]);
                }}
              >
                <option value="">{t("All candidates")}</option>
                {workflows.map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" variant="secondary">
              {t("Apply candidate filters")}
            </Button>
          </form>
        ) : null}
        <FormField label="Категория контакта">
          <Select aria-label="Категория контакта" value={filter.contactCategory ?? ""} onChange={(event) => { setFilter({ ...filter, contactCategory: (event.target.value || undefined) as LeadPreparationQueueInput["contactCategory"] }); setSelected([]); }}>
            <option value="">Все категории</option>
            <option value="BUSINESS_CONTACT_FOUND">Бизнес-контакт найден</option>
            <option value="CONTACT_POINT_ONLY">Только ссылка на проект</option>
            <option value="CONTACT_NOT_FOUND">Контакт не найден</option>
            <option value="TARGET_UNRESOLVED">Проект не установлен</option>
          </Select>
        </FormField>
        {canReview && !compact ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!selected.length || review.isPending}
              onClick={() => setConfirm("APPROVE")}
            >
              {t("Approve selected")} ({selected.length}/20)
            </Button>
            <Button
              variant="secondary"
              disabled={!selected.length || review.isPending}
              onClick={() => setConfirm("REJECT")}
            >
              {t("Reject selected")} ({selected.length}/20)
            </Button>
            <span className="self-center text-xs text-neutral-400">
              {t("Bulk review never qualifies or generates AI messages.")}
            </span>
          </div>
        ) : null}
        {limitError ? (
          <p role="alert">{t("Select no more than 20 candidates.")}</p>
        ) : null}
        {review.isError ? (
          <p role="alert" className="text-sm text-amber-200">
            {t(
              "Bulk review failed. Reload stale or inaccessible candidates and review again.",
            )}
          </p>
        ) : null}
      </div>
      <div className={compact ? "grid min-w-0 gap-4" : "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(13rem,.65fr)_minmax(0,2.35fr)]"}>
        <div
          className={`min-w-0 space-y-3 ${details ? (compact ? "hidden" : "hidden xl:block") : ""}`}
        >
          <LeadQueryState
            loading={query.isLoading}
            error={query.isError}
            empty={query.isSuccess && !items.length}
            onRetry={() => void query.refetch()}
          />
          {query.isSuccess ? <p className="text-xs text-neutral-400">Найдено: {query.data?.pages[0]?.total ?? items.length}</p> : null}
          {items.map((v) => (
            <Card
              key={v.id}
              className={
                details === v.id ? "!border-blue-700 !bg-blue-950/20" : ""
              }
            >
              <button
                className="min-h-11 w-full break-words text-left text-sm font-semibold text-blue-200"
                aria-pressed={details === v.id}
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setDetails(v.id);
                  requestAnimationFrame(() => {
                    heading.current?.focus();
                    if (window.innerWidth < 1280)
                      heading.current?.scrollIntoView?.({ block: "start" });
                  });
                }}
              >
                {v.title}
              </button>
              <p className="mt-1 break-words text-xs text-neutral-400">
                {v.niche || t("Unknown niche")} ·{" "}
                {t(v.preparation?.workflowState ?? "NEW")}
              </p>
              <p className="mt-2 break-words text-xs text-neutral-400">
                {v.sources.map((s) => s.title).join(" · ") ||
                  t("Evidence not linked")}
              </p>
              <p className="mt-2 text-xs text-blue-200">{contactCategoryLabel[candidateContactCategory(v)]} · {candidateContactCategory(v)}</p>
              <p className="mt-1 break-words text-xs text-neutral-300">
                {v.contacts.find(isBusinessContact) ? `${contactDescription(v.contacts.find(isBusinessContact)!)}: ${v.contacts.find(isBusinessContact)!.value} · требует проверки` : "Публичный бизнес-контакт не найден"}
              </p>
              <p className="mt-1 text-xs text-neutral-400">Проверка: {v.reviewStatus}</p>
              {v.preparation?.qualification?.score ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-neutral-400">{t("Relevance")}</dt>
                    <dd>
                      {v.preparation.qualification.score.relevance ??
                        t("Insufficient evidence")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400">{t("Risk level")}</dt>
                    <dd className="break-words text-amber-200">
                      {v.preparation.qualification.score.riskLevel}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {v.risks.length ? (
                <p className="mt-2 text-xs text-amber-200">
                  {v.risks.join(" · ")}
                </p>
              ) : null}
              {canReview && !compact ? (
                <label className="mt-2 flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    aria-label={`Select candidate ${v.title}`}
                    checked={selected.includes(v.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, v.id]
                        : selected.filter((id) => id !== v.id);
                      if (next.length > 20) setLimitError(true);
                      else {
                        setSelected(next);
                        setLimitError(false);
                      }
                    }}
                  />
                  {t("Select")}
                </label>
              ) : null}
            </Card>
          ))}
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("Load more candidates")}
            </Button>
          ) : null}
        </div>
        {details ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                ref={heading}
                tabIndex={-1}
                className="min-w-0 scroll-mt-20 break-words text-lg font-semibold outline-none"
              >
                {detail.data?.title ?? t("Candidate details")}
              </h2>
              <Button
                variant="secondary"
                onClick={() => {
                  setDetails(null);
                  requestAnimationFrame(() => opener.current?.focus());
                }}
              >
                {t("Back to candidates")}
              </Button>
            </div>
            <LeadQueryState
              loading={detail.isLoading}
              error={detail.isError}
              empty={false}
              onRetry={() => void detail.refetch()}
            />
            {detail.data ? (
              <LeadCandidateContent
                key={detail.data.id}
                candidate={detail.data}
                canReview={canReview}
                onReload={() => void detail.refetch()}
              />
            ) : null}
          </div>
        ) : (
          <div className={compact ? "hidden" : "hidden min-h-52 place-items-center rounded-xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-400 xl:grid"}>
            {t("Select a candidate to inspect evidence and prepare an offer.")}
          </div>
        )}
      </div>
      {confirm ? (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={t("Confirm bulk review")}
        >
          <p className="text-sm">
            {t(
              "Apply this human review decision to the selected candidates? No AI or message is sent.",
            )}{" "}
            {confirm} · {selected.length}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={review.isPending}
              onClick={() => review.mutate(confirm)}
            >
              {t("Confirm selected review")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t("Cancel")}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
