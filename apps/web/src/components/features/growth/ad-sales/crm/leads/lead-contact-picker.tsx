"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Input, Select } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  leadKeys,
  leadQueryPolicy,
} from "@/lib/features/growth/lead-discovery-query";
export function LeadContactPicker({
  workspace,
  value,
  onChange,
}: {
  workspace: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useLeadText();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const query = useInfiniteQuery({
    queryKey: leadKeys.contacts(workspace, search),
    queryFn: ({ pageParam, signal }) =>
      telegramCrmApi.listContacts(
        {
          page: pageParam,
          pageSize: 20,
          search: search || undefined,
          archived: false,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (page) =>
      page.pagination.hasNextPage ? page.pagination.page + 1 : undefined,
    ...leadQueryPolicy,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search existing CRM clients"
          value={draft}
          maxLength={100}
          placeholder={t("Client name or business identifier")}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          className="max-w-full !whitespace-normal"
          type="button"
          variant="secondary"
          onClick={() => setSearch(draft.trim())}
        >
          {t("Search clients")}
        </Button>
      </div>
      <Select
        aria-label="Existing CRM client"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("Choose an existing client")}</option>
        {value && !items.some((v) => v.id === value) ? (
          <option value={value}>{t("Selected client")}</option>
        ) : null}
        {items.map((v) => (
          <option key={v.id} value={v.id}>
            {v.displayName}
            {v.telegramUsername ? ` · @${v.telegramUsername}` : ""}
          </option>
        ))}
      </Select>
      {query.isError ? (
        <p role="alert">
          {t("CRM clients could not be loaded. Check CRM view permissions.")}
        </p>
      ) : null}
      {query.hasNextPage ? (
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("Load more clients")}
        </Button>
      ) : null}
    </div>
  );
}
