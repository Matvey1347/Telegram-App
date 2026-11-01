"use client";
import { salesStatusLabel, useCrmSalesCopy } from "../crm-sales-copy";
import { useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  normalizeInstagramProfile,
  type CrmManualContactsFilter,
} from "@telegram-system/shared";
import { Button, FormField, Input, Select } from "@/components/ui/primitives";
import {
  crmManualApi,
  crmManualKeys,
  crmManualPolicy,
} from "@/lib/features/growth/crm-manual-api";
import { ManualContactPanel } from "./manual-contact-panel";
export function ManualContacts({
  workspace,
  canCreate,
  initialContactId,
  onContactOpenChange,
}: {
  workspace: string;
  canCreate: boolean;
  initialContactId?: string;
  onContactOpenChange?: (open: boolean) => void;
}) {
  const statusCopy = useCrmSalesCopy();
  const client = useQueryClient();
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState(initialContactId ?? null);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [status, setStatus] =
    useState<CrmManualContactsFilter["status"]>("ALL");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const filter = { search: applied || undefined, status, limit: 50 };
  const list = useInfiniteQuery({
    queryKey: crmManualKeys.list(workspace, filter),
    queryFn: ({ pageParam, signal }) =>
      crmManualApi.list({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) =>
      p.hasMore ? (p.nextCursor ?? undefined) : undefined,
    enabled: !!workspace,
    ...crmManualPolicy,
  });
  const create = useMutation({
    mutationFn: () =>
      crmManualApi.create({
        displayName: name.trim(),
        instagramValue: value,
        ownershipConfirmed: confirmed,
      }),
    retry: false,
    onSuccess: (w) => {
      client.setQueryData(crmManualKeys.workflow(workspace, w.contactId), w);
      void client.invalidateQueries({
        queryKey: crmManualKeys.lists(workspace),
      });
      setSelected(w.contactId);
      onContactOpenChange?.(true);
      setAdding(false);
      setName("");
      setValue("");
      setConfirmed(false);
    },
  });
  let valid = false;
  try {
    normalizeInstagramProfile(value);
    valid = true;
  } catch {}
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="space-y-4">
      <header
        className={`${selected ? "hidden lg:flex" : "flex"} flex-wrap justify-between gap-2`}
      >
        <div>
          <h2 className="text-lg font-semibold">Manual Instagram contacts</h2>
          <p className="text-sm text-neutral-400">
            Open the profile, prepare an offer and record your next step.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setAdding(!adding)}>
            Add Instagram client
          </Button>
        ) : null}
      </header>
      {adding ? (
        <form
          className="space-y-3 rounded-xl border border-neutral-800 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && name.trim() && !create.isPending) create.mutate();
          }}
        >
          <FormField label="Client name">
            <Input
              aria-label="Instagram client name"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Instagram username / profile">
            <Input
              aria-label="New Instagram profile"
              required
              maxLength={500}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setConfirmed(false);
              }}
              placeholder="@business_name"
            />
          </FormField>
          {value && !valid ? (
            <p role="alert">
              Use a username or an HTTPS instagram.com profile URL.
            </p>
          ) : null}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I confirm this profile belongs to this advertiser. Profile
              existence remains unverified.
            </span>
          </label>
          {create.isError ? (
            <p role="alert" className="text-sm text-amber-200">
              Could not create client. Review identity conflicts and
              permissions; no automatic name matching.
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={!valid || !name.trim() || create.isPending}
          >
            Create manual client
          </Button>
        </form>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <aside
          className={`${selected ? "hidden lg:block" : ""} min-w-0 space-y-3`}
        >
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(search.trim());
            }}
          >
            <Input
              aria-label="Search manual contacts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or Instagram"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <Select
            aria-label="Manual sales status"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as CrmManualContactsFilter["status"])
            }
          >
            {[
              "ALL",
              "WAITING_FOR_CLIENT",
              "FOLLOW_UP_DUE",
              "NEEDS_REPLY",
              "INTERESTED",
              "CLOSED",
              "DO_NOT_CONTACT",
              "STALE",
            ].map((v) => (
              <option key={v} value={v}>
                {v === "ALL"
                  ? "All statuses"
                  : v === "STALE"
                    ? "Stale profiles"
                    : salesStatusLabel(
                        v as Parameters<typeof salesStatusLabel>[0],
                        statusCopy,
                      )}
              </option>
            ))}
          </Select>
          {list.isLoading ? <p role="status">Loading contacts…</p> : null}
          {list.isError ? (
            <div role="alert">
              Contacts unavailable.{" "}
              <Button onClick={() => void list.refetch()}>Retry</Button>
            </div>
          ) : null}
          {!list.isLoading && !list.isError && !items.length ? (
            <p className="p-4 text-sm text-neutral-400">
              No Instagram contacts found. Add a reviewed profile or change the
              filter.
            </p>
          ) : null}
          <div className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === selected}
                className={`block min-h-20 w-full min-w-0 space-y-1 px-3 py-3 text-left ${c.id === selected ? "bg-neutral-800" : "hover:bg-neutral-900"}`}
                onClick={(event) => {
                  selectedButton.current = event.currentTarget;
                  setSelected(c.id);
                  onContactOpenChange?.(true);
                }}
              >
                <span className="block break-words text-sm font-semibold">
                  {c.displayName}
                </span>
                <span className="block break-all text-xs text-blue-300">
                  {c.methods.map((m) => `@${m.username}`).join(" · ")}
                </span>
                <span className="block break-words text-xs text-neutral-500">
                  {c.source ?? "Manual contact"} ·{" "}
                  {c.ownerMember?.name ?? "Unassigned"}
                </span>
                <span className="block text-xs text-neutral-400">
                  {c.attentionStatus
                    ? salesStatusLabel(c.attentionStatus, statusCopy)
                    : "No manual contact yet"}
                </span>
                {c.nextContactAt ? (
                  <span className="block text-xs text-amber-200">
                    Follow-up · {new Date(c.nextContactAt).toLocaleString()}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {list.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more contacts
            </Button>
          ) : null}
        </aside>
        <div
          className={`${selected ? "" : "hidden lg:block"} min-w-0 rounded-xl border border-neutral-800 bg-neutral-950 p-4`}
        >
          {selected ? (
            <>
              <Button
                variant="secondary"
                className="mb-4 lg:hidden"
                onClick={() => {
                  setSelected(null);
                  onContactOpenChange?.(false);
                  requestAnimationFrame(() => selectedButton.current?.focus());
                }}
              >
                ← Back to contacts
              </Button>
              <h2 className="mb-3 break-words text-lg font-semibold">
                {items.find((c) => c.id === selected)?.displayName ??
                  "CRM client"}
              </h2>
              <ManualContactPanel
                key={`${workspace}:${selected}`}
                workspace={workspace}
                contactId={selected}
              />
            </>
          ) : (
            <p className="p-6 text-sm text-neutral-400">
              Select a client to work with their Instagram profile.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
