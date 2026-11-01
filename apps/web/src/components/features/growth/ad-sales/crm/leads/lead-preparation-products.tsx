"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CrmPackageProduct } from "@telegram-system/shared";
import { Button, FormField, MultiSelect } from "@/components/ui/primitives";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
import { useQualificationText } from "./qualification-copy";
export function LeadPreparationProducts({
  workspace,
  value,
  onChange,
  selected,
}: {
  workspace: string;
  value: string[];
  onChange: (v: string[]) => void;
  selected: CrmPackageProduct[];
}) {
  const t = useQualificationText();
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: leadKeys.preparationProducts(workspace),
    queryFn: ({ pageParam, signal }) =>
      leadPreparationApi.products(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
    enabled: open,
    ...leadQueryPolicy,
  });
  const choices = [
    ...new Map(
      [
        ...(query.data?.pages.flatMap((v) => v.products) ?? []),
        ...selected,
      ].map((v) => [v.id, v]),
    ).values(),
  ];
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {t("Choose real products / packages")}
      </Button>
      {open ? (
        <>
          <FormField label={t("Selected products (up to 5)")}>
            <MultiSelect
              value={value}
              onChange={(v) => {
                if (v.length <= 5) onChange(v);
              }}
              options={choices.map((v) => ({
                value: v.id,
                label: `${v.name} · ${v.channel.title} · ${v.fixedPrice ?? t("Quote required")} ${v.currency ?? ""}`,
              }))}
              placeholder={t("Select products")}
            />
          </FormField>
          {query.isLoading ? (
            <p role="status">{t("Loading products…")}</p>
          ) : null}
          {query.isError ? (
            <p role="alert">
              {t("Products unavailable. Check Sales permissions.")}{" "}
              <button
                className="text-blue-300 underline"
                onClick={() => void query.refetch()}
              >
                {t("Retry")}
              </button>
            </p>
          ) : null}
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t("Load more products")}
            </Button>
          ) : null}
        </>
      ) : null}
      <p className="text-xs text-neutral-400">
        {t(
          "Only selected current products prove prices. Package totals and audience claims need verified facts.",
        )}
      </p>
    </div>
  );
}
