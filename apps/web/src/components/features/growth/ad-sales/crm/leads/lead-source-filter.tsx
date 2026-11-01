"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Select } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
export function LeadSourceFilter({
  workspace,
  value,
  onChange,
}: {
  workspace: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useLeadText();
  const [open, setOpen] = useState(false);
  const filter = { limit: 50 };
  const query = useInfiniteQuery({
    queryKey: leadKeys.sources(workspace, filter),
    queryFn: ({ pageParam, signal }) =>
      leadDiscoveryApi.sources({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    enabled: open,
    ...leadQueryPolicy,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-2">
      <Button
        className="max-w-full !whitespace-normal"
        variant="secondary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value ? "Source filter selected" : "Choose source filter"}
      </Button>
      {open ? (
        <>
          <Select
            aria-label="Filter by source"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t("All sources")}</option>
            {value && !items.some((v) => v.id === value) ? (
              <option value={value}>{t("Selected source")}</option>
            ) : null}
            {items.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
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
              {t("Load source choices")}
            </Button>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-xs">
              {t("Source choices could not be loaded.")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
