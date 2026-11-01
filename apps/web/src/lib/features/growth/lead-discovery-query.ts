import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  LeadPage,
  LeadSourceView,
  LeadCandidateView,
  LeadObservationView,
  LeadSourceListFilter,
  LeadFeedFilter,
  LeadCandidateListFilter,
  LeadPreparationQueueInput,
  LeadPreparationView,
} from "@telegram-system/shared";
export const leadKeys = {
  queueRoot: (w: string) => ["lead-discovery", w, "review-queue"] as const,
  queue: (w: string, f: LeadPreparationQueueInput) =>
    [...leadKeys.queueRoot(w), f] as const,
  preparationRoot: (w: string) => ["lead-discovery", w, "preparation"] as const,
  preparation: (w: string, c: string) =>
    [...leadKeys.preparationRoot(w), c] as const,
  preparationProducts: (w: string) =>
    ["lead-discovery", w, "preparation-products"] as const,
  contactPreparations: (w: string, c: string) =>
    ["lead-discovery", w, "contact-preparations", c] as const,
  mergeChoices: (w: string, c: string, q: string) =>
    ["lead-discovery", w, "merge-choices", c, q] as const,
  config: (w: string) => ["lead-discovery", w, "config"] as const,
  accounts: (w: string) => ["lead-discovery", w, "accounts"] as const,
  channels: (w: string, a: string) =>
    ["lead-discovery", w, "channels", a] as const,
  sourcesRoot: (w: string) => ["lead-discovery", w, "sources"] as const,
  sources: (w: string, f: LeadSourceListFilter) =>
    [...leadKeys.sourcesRoot(w), f] as const,
  feedRoot: (w: string) => ["lead-discovery", w, "feed"] as const,
  feed: (w: string, f: LeadFeedFilter) => [...leadKeys.feedRoot(w), f] as const,
  candidatesRoot: (w: string) => ["lead-discovery", w, "candidates"] as const,
  candidates: (w: string, f: LeadCandidateListFilter) =>
    [...leadKeys.candidatesRoot(w), f] as const,
  candidateRoot: (w: string) => ["lead-discovery", w, "candidate"] as const,
  candidate: (w: string, c: string) =>
    ["lead-discovery", w, "candidate", c] as const,
  contacts: (w: string, q: string) =>
    ["lead-discovery", w, "contact-picker", q] as const,
};
export const leadQueryPolicy = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;
export function leadAccess(access?: {
  isOwner: boolean;
  permissionKeys: readonly string[];
}) {
  const has = (p: string) =>
    !!access?.isOwner ||
    !!access?.permissionKeys.includes(`adSales.leads.${p}`);
  return {
    view: has("view"),
    manage: has("manage"),
    review: has("review"),
    analyze: has("analyze"),
  };
}
export async function patchLeadEntity<
  T extends LeadSourceView | LeadCandidateView | LeadObservationView,
>(client: QueryClient, key: readonly unknown[], item: T) {
  await client.cancelQueries({ queryKey: key });
  for (const [cacheKey, old] of client.getQueriesData<
    InfiniteData<LeadPage<T>>
  >({ queryKey: key })) {
    if (!old) continue;
    const filter = (cacheKey[3] ?? {}) as LeadSourceListFilter &
      LeadCandidateListFilter;
    const visible =
      (!filter.reviewStatus ||
        !("reviewStatus" in item) ||
        filter.reviewStatus === item.reviewStatus) &&
      (!filter.status ||
        !("status" in item) ||
        filter.status === item.status) &&
      (!filter.riskStatus ||
        !("riskStatus" in item) ||
        filter.riskStatus === item.riskStatus);
    client.setQueryData(cacheKey, {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((v) =>
          v.id !== item.id ? [v] : visible ? [item] : [],
        ),
      })),
    });
  }
}
export function invalidateLeadResults(client: QueryClient, w: string) {
  return Promise.all(
    [
      leadKeys.sourcesRoot(w),
      leadKeys.feedRoot(w),
      leadKeys.candidatesRoot(w),
      leadKeys.queueRoot(w),
      leadKeys.preparationRoot(w),
    ].map((queryKey) =>
      client.invalidateQueries({ queryKey, refetchType: "active" }),
    ),
  );
}

/** Reconcile returned preparation without reloading unrelated sources or feed. */
export function patchLeadPreparation(
  client: QueryClient,
  workspace: string,
  view: LeadPreparationView,
) {
  client.setQueryData(leadKeys.preparation(workspace, view.candidateId), view);
  for (const [key, old] of client.getQueriesData<
    InfiniteData<LeadPage<LeadCandidateView>>
  >({ queryKey: leadKeys.queueRoot(workspace) })) {
    if (!old) continue;
    const filter = key[3] as LeadPreparationQueueInput;
    const summary = {
      workflowState: view.workflowState,
      qualification: view.qualification
        ? {
            id: view.qualification.id,
            status: view.qualification.status,
            score: view.qualification.score,
            policyVersion: view.qualification.policyVersion,
          }
        : null,
      hasApprovedDraft: view.drafts.some((v) => v.canCopy),
    };
    const visible =
      !filter.workflow ||
      (filter.workflow === "HIGH_PRIORITY"
        ? view.qualification?.score?.priority === "HIGH"
        : filter.workflow === view.workflowState);
    client.setQueryData(key, {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((item) =>
          item.id !== view.candidateId
            ? [item]
            : visible
              ? [{ ...item, preparation: summary }]
              : [],
        ),
      })),
    });
  }
}
