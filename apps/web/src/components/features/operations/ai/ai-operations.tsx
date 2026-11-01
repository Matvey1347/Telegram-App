"use client";
import { useAiText } from "./ai-copy";
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { AiOperationView, AiUsageFilter, AiOperationsFilter } from "@telegram-system/shared";
import { Button, FormField, Input, Table } from "@/components/ui/primitives";
import { aiApi } from "@/lib/features/operations/ai-api";
import { aiKeys, aiQueryPolicy } from "@/lib/features/operations/ai-query-keys";
import { aiCategory, aiMoney } from "./ai-format";
export function AiOperations({
  workspaceId,
  filter,
  canManage,
}: {
  workspaceId: string;
  filter: AiUsageFilter;
  canManage: boolean;
}) {
  const t = useAiText();
  const queryClient = useQueryClient();
  const [held, setHeld] = useState(false);
  const [candidateOffers, setCandidateOffers] = useState(false);
  const requestFilter: AiOperationsFilter = { ...(held
    ? {
        ...filter,
        from: undefined,
        to: undefined,
        status: undefined,
        unresolved: true,
      }
    : filter), ...(candidateOffers ? { businessScope: "CANDIDATE_FIRST_OFFER" as const, category: "SALES_FIRST_DRAFT" as const } : {}) };
  const query = useInfiniteQuery({
    queryKey: aiKeys.operations(workspaceId, requestFilter),
    queryFn: ({ pageParam }) =>
      aiApi.operations({ ...requestFilter, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...aiQueryPolicy,
  });
  const [selected, setSelected] = useState<AiOperationView | null>(null);
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      aiApi.reconcile(selected!.id, { actualCost: amount, evidence }),
    onSuccess: () => {
      setSelected(null);
      void queryClient.invalidateQueries({
        queryKey: aiKeys.analytics(workspaceId),
      });
    },
  });
  const valid =
    /^(0|[1-9]\d{0,11})(\.\d{1,12})?$/.test(amount) &&
    /^(invoice|provider|audit):[A-Za-z0-9_.-]{1,80}$/.test(evidence) &&
    confirmed;
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-lg font-semibold">{t("Requests")}</h3>
      <p className="text-xs text-neutral-400">
        {t("Telemetry only. Prompts, responses and credentials are excluded.")}
      </p>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={held}
          onChange={(e) => {
            setHeld(e.target.checked);
            setSelected(null);
          }}
        />
        {t("Unresolved / held operations · all ages")}
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={candidateOffers} onChange={(e) => { setCandidateOffers(e.target.checked); setSelected(null); }} />
        {t("Candidate first-offer operations only")}
      </label>
      {candidateOffers ? <p className="text-xs text-neutral-400">{t("History filter only. Financial totals above retain the selected category scope.")}</p> : null}
      {held ? (
        <p className="text-xs text-amber-200">
          {t(
            "Date and status filters are ignored for this list. Reservations stay held until verified reconciliation; active requests cannot be settled.",
          )}
        </p>
      ) : null}
      {query.isLoading ? (
        <p role="status">{t("Loading requests…")}</p>
      ) : query.isError ? (
        <p role="alert">
          Requests could not be loaded.{" "}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t("Retry")}
          </Button>
        </p>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                {[
                  "Date / feature",
                  "Model",
                  "Tokens in / out",
                  "Cost / reserved USD",
                  "Duration",
                  "Status / error",
                  "",
                ].map((v) => (
                  <th key={v} className="px-3 py-2">
                    {t(v)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.pages
                .flatMap((page) => page.items)
                .map((v) => (
                  <tr key={v.id} className="border-t border-neutral-800">
                    <td className="px-3 py-3">
                      <p>{new Date(v.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-neutral-400">
                        {aiCategory(v.category)}
                        {v.businessObjectId?.startsWith("lead-candidate-draft:") ? ` · ${t("Candidate preparation")}` : null}
                      </p>
                    </td>
                    <td className="max-w-52 break-all px-3 py-3">{v.model}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {v.inputTokens ?? "?"} / {v.outputTokens ?? "?"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {aiMoney(v.actualCost)}
                      <p className="text-xs text-neutral-400">
                        {v.pricingStatus} · {aiMoney(v.reservedCost)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {v.durationMs === null ? "—" : `${v.durationMs} ms`}
                    </td>
                    <td className="px-3 py-3">
                      {v.status}
                      <p className="text-xs text-amber-200">
                        {v.errorCategory}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {canManage && v.status === "UNKNOWN" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelected(v);
                            setAmount("");
                            setEvidence("");
                            setConfirmed(false);
                            mutation.reset();
                          }}
                        >
                          {t("Reconcile")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
          {!query.data?.pages[0].items.length ? (
            <p className="py-4 text-neutral-400">
              {t("No requests match these filters.")}
            </p>
          ) : null}
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("Load more")}
            </Button>
          ) : null}
        </>
      )}
      {selected ? (
        <form
          className="space-y-3 rounded-lg border border-amber-800 bg-neutral-900 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <h4 className="font-semibold">{t("Reconcile uncertain charge")}</h4>
          <p className="text-sm text-amber-200">
            {t(
              "Use a verified provider invoice or audit record. This settles the reservation and never calls the AI provider.",
            )}
          </p>
          <FormField label={t("Verified cost (USD)")}>
            <Input
              aria-label={t("Verified cost (USD)")}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField label={t("Evidence reference")}>
            <Input
              aria-label={t("Evidence reference")}
              placeholder="invoice:record-id"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </FormField>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("I verified this amount against the provider record.")}
          </label>
          {mutation.isError ? (
            <p role="alert" className="text-rose-300">
              {t(
                "Settlement failed. Check permissions and evidence, then retry.",
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {t("Confirm settlement")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(null)}
            >
              {t("Cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
