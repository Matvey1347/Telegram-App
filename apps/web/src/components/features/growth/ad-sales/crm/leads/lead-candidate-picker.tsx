"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Input, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
export function LeadCandidatePicker({
  workspace,
  current,
  value,
  onChange,
}: {
  workspace: string;
  current: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const query = useInfiniteQuery({
    queryKey: leadKeys.mergeChoices(workspace, current, search),
    queryFn: ({ pageParam, signal }) =>
      leadDiscoveryApi.candidates(
        { search: search || undefined, limit: 10, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    ...leadQueryPolicy,
  });
  const items = (query.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (v) =>
      v.id !== current &&
      !["MERGED", "REJECTED"].includes(v.reviewStatus) &&
      v.riskStatus !== "REJECTED",
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-400">
        Search existing candidates and verify a shared advertiser identity from
        evidence. A similar name is not proof.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search duplicate candidates"
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          type="button"
          onClick={() => setSearch(draft.trim())}
        >
          Search duplicate candidates
        </Button>
      </div>
      <Select
        aria-label="Manual merge target"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a verified duplicate</option>
        {value && !items.some((v) => v.id === value) ? (
          <option value={value}>Selected candidate</option>
        ) : null}
        {items.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title} · {v.reviewStatus}
          </option>
        ))}
      </Select>
      {query.hasNextPage ? (
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more duplicate choices
        </Button>
      ) : null}
      {query.isError ? (
        <p role="alert">Duplicate candidates could not be loaded.</p>
      ) : null}
    </div>
  );
}
