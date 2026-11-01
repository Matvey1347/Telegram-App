"use client";
import { useLeadText } from "./lead-copy";
import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  LEAD_AD_CLASSES,
  type LeadDiscoveryConfig,
  type LeadFeedFilter,
} from "@telegram-system/shared";
import { Button, FormField, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  invalidateLeadResults,
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { aiKeys } from "@/lib/features/operations/ai-query-keys";
import { LeadSourceFilter } from "./lead-source-filter";
import { LeadObservationCard } from "./lead-observation-card";
import { LeadQueryState } from "./lead-query-state";
export function LeadFeed({
  workspace,
  config,
}: {
  workspace: string;
  config: LeadDiscoveryConfig;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [filter, setFilter] = useState<LeadFeedFilter>({ limit: 50 });
  const [draftFilter, setDraftFilter] = useState({
    classification: "",
    reviewStatus: "",
    riskStatus: "",
  });
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [limitError, setLimitError] = useState(false);
  const query = useInfiniteQuery({
    queryKey: leadKeys.feed(workspace, filter),
    queryFn: ({ pageParam, signal }) =>
      leadDiscoveryApi.feed({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    ...leadQueryPolicy,
  });
  const analyzing = useRef(false);
  const analyze = useMutation({
    mutationFn: () => leadDiscoveryApi.analyze(selected),
    onSuccess: async () => {
      setSelected([]);
      await invalidateLeadResults(client, workspace);
    },
    onSettled: () =>
      client.invalidateQueries({
        queryKey: aiKeys.analytics(workspace),
        refetchType: "active",
      }),
    retry: false,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="min-w-0 space-y-4">
      <p className="text-sm text-neutral-400">
        {t(
          "Only permitted evidence is listed. Nothing is analyzed on page open. Select up to 5 materials for explicit budget-controlled classification and contact extraction.",
        )}
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSelected([]);
          setFilter({
            limit: 50,
            sourceId: source || undefined,
            classification: draftFilter.classification || undefined,
            reviewStatus: (draftFilter.reviewStatus ||
              undefined) as LeadFeedFilter["reviewStatus"],
            riskStatus: (draftFilter.riskStatus ||
              undefined) as LeadFeedFilter["riskStatus"],
          });
        }}
      >
        <LeadSourceFilter
          workspace={workspace}
          value={source}
          onChange={setSource}
        />
        <FormField label={t("Classification")}>
          <Select
            aria-label="Advertisement classification"
            name="classification"
            value={draftFilter.classification}
            onChange={(e) =>
              setDraftFilter({ ...draftFilter, classification: e.target.value })
            }
          >
            <option value="">{t("All classes")}</option>
            {LEAD_AD_CLASSES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Evidence review")}>
          <Select
            aria-label={t("Evidence review")}
            name="reviewStatus"
            value={draftFilter.reviewStatus}
            onChange={(e) =>
              setDraftFilter({ ...draftFilter, reviewStatus: e.target.value })
            }
          >
            <option value="">{t("All reviews")}</option>
            {["PENDING", "APPROVED", "REJECTED"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("Risk status")}>
          <Select
            aria-label="Feed risk status"
            name="riskStatus"
            value={draftFilter.riskStatus}
            onChange={(e) =>
              setDraftFilter({ ...draftFilter, riskStatus: e.target.value })
            }
          >
            <option value="">{t("All risk states")}</option>
            {["NEEDS_REVIEW", "ACCEPTABLE", "SUSPICIOUS", "REJECTED"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </Select>
        </FormField>
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          type="submit"
        >
          {t("Apply feed filters")}
        </Button>
      </form>
      {config.canAnalyze ? (
        <Button
          className="max-w-full !whitespace-normal"
          disabled={!config.enabled || !selected.length || analyze.isPending}
          onClick={() => {
            if (analyzing.current || !selected.length) return;
            analyzing.current = true;
            analyze.mutate(undefined, {
              onSettled: () => {
                analyzing.current = false;
              },
            });
          }}
        >
          {analyze.isPending
            ? "Analyzing selected materials…"
            : `Analyze ${selected.length} selected materials`}
        </Button>
      ) : null}
      {limitError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t("Select no more than 5 materials.")}
        </p>
      ) : null}
      {analyze.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          {t(
            "Analysis could not complete. Check AI budgets, permissions, source/AI grants and held usage. No automatic paid retry occurs.",
          )}
        </p>
      ) : null}
      {analyze.data ? (
        <p role="status" className="text-sm">
          Analyzed {analyze.data.analyzed} · Extracted {analyze.data.extracted}{" "}
          · Skipped unchanged {analyze.data.skipped} · Unknown{" "}
          {analyze.data.unknown} · Failed {analyze.data.failed}
        </p>
      ) : null}
      <LeadQueryState
        loading={query.isLoading}
        error={query.isError}
        empty={query.isSuccess && !items.length}
        onRetry={() => void query.refetch()}
      />
      {items.map((v) => (
        <LeadObservationCard
          key={v.id}
          observation={v}
          workspace={workspace}
          canReview={config.canReview}
          selected={selected.includes(v.id)}
          onSelect={
            config.canAnalyze
              ? (checked) => {
                  const next = checked
                    ? [...selected, v.id]
                    : selected.filter((id) => id !== v.id);
                  if (next.length > 5) setLimitError(true);
                  else {
                    setSelected(next);
                    setLimitError(false);
                  }
                }
              : undefined
          }
        />
      ))}
      {query.hasNextPage ? (
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("Load more materials")}
        </Button>
      ) : null}
    </section>
  );
}
