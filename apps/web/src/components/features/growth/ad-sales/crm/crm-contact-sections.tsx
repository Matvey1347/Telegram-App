"use client";

import { useQuery } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { Button, EmptyState } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";

export type CrmContactTab =
  | "conversations"
  | "deals"
  | "payments"
  | "tasks"
  | "notes"
  | "info"
  | "tags"
  | "automation";

function SectionState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p className="py-6 text-sm text-neutral-500">Loading…</p>;
  if (error)
    return (
      <div className="py-5">
        <p className="mb-2 text-sm text-rose-300">
          This section could not be loaded.
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  if (empty) return <EmptyState text="Nothing here yet." />;
  return null;
}

export function CrmDealsSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "deals"],
    queryFn: ({ signal }) =>
      telegramAdSalesApi.listSalesPage(
        { advertiserId: contact.id, page: 1, pageSize: 25 },
        signal,
      ),
  });
  const state = (
    <SectionState
      loading={query.isLoading}
      error={query.isError}
      empty={!query.data?.items.length}
      onRetry={() => void query.refetch()}
    />
  );
  if (!query.data?.items.length) return state;
  return (
    <ol className="space-y-2">
      {query.data.items.map((deal) => (
        <li key={deal.id} className="rounded-lg border border-neutral-800 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-white">
              {contact.displayName} · {deal.id.slice(0, 8)}
            </span>
            <span className="text-xs text-neutral-400">{deal.status}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {deal.placements.length} placement
            {deal.placements.length === 1 ? "" : "s"} ·{" "}
            {deal.settlementCurrency}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function CrmPaymentsSection({ contact }: { contact: CrmContactDetail }) {
  if (!contact.paymentSummary.length)
    return <EmptyState text="No payment balance for this contact." />;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {contact.paymentSummary.map((payment) => (
        <div
          key={payment.currency}
          className="rounded-lg border border-neutral-800 p-3"
        >
          <dt className="text-xs text-neutral-500">{payment.currency}</dt>
          <dd className="mt-1 text-sm text-white">
            {payment.paidAmount} paid / {payment.agreedAmount} agreed
          </dd>
          <p className="mt-1 text-xs text-amber-300">
            {payment.outstandingAmount} outstanding
          </p>
        </div>
      ))}
    </dl>
  );
}

export function CrmTasksSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "tasks"],
    queryFn: () =>
      telegramAdSalesApi.listCrmTasks({
        advertiserId: contact.id,
        page: 1,
        pageSize: 25,
      }),
  });
  const state = (
    <SectionState
      loading={query.isLoading}
      error={query.isError}
      empty={!query.data?.items.length}
      onRetry={() => void query.refetch()}
    />
  );
  if (!query.data?.items.length) return state;
  return (
    <ol className="space-y-2">
      {query.data.items.map((task) => (
        <li key={task.id} className="rounded-lg border border-neutral-800 p-3">
          <span className="font-medium text-white">{task.title}</span>
          <p className="mt-1 text-xs text-neutral-500">
            {task.status} · {task.priority} · due {task.dueAt || "not set"}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function CrmNotesSection({ contact }: { contact: CrmContactDetail }) {
  const query = useQuery({
    queryKey: ["telegram-ad-sales", "crm-contact", contact.id, "activities"],
    queryFn: () =>
      telegramAdSalesApi.listAdvertiserActivities(contact.id, {
        page: 1,
        pageSize: 25,
      }),
  });
  const state = (
    <SectionState
      loading={query.isLoading}
      error={query.isError}
      empty={!query.data?.items.length}
      onRetry={() => void query.refetch()}
    />
  );
  if (!query.data?.items.length) return state;
  return (
    <ol className="space-y-2">
      {query.data.items.map((activity) => (
        <li
          key={activity.id}
          className="rounded-lg border border-neutral-800 p-3"
        >
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            {activity.type}
          </span>
          <p className="mt-1 text-sm font-medium text-neutral-200">
            {activity.title}
          </p>
          {activity.description ? (
            <p className="mt-1 text-sm text-neutral-400">
              {activity.description}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function CrmInfoSection({ contact }: { contact: CrmContactDetail }) {
  const rows = [
    [
      "Telegram",
      contact.telegramUsername
        ? `@${contact.telegramUsername.replace(/^@/, "")}`
        : null,
    ],
    ["Phone", contact.phone],
    ["Email", contact.email],
    ["Website", contact.website],
    ["Company", contact.companyName],
    ["Source", contact.source],
    ["Description", contact.description],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-neutral-800 p-3">
          <dt className="text-xs text-neutral-500">{label}</dt>
          <dd className="mt-1 break-words text-sm text-neutral-200">
            {value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CrmTagsSection({ contact }: { contact: CrmContactDetail }) {
  if (!contact.tags.length)
    return <EmptyState text="No tags on this contact." />;
  return (
    <div className="flex flex-wrap gap-2">
      {contact.tags.map((tag) => (
        <span
          key={tag.id}
          className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-200"
          style={tag.color ? { borderColor: tag.color } : undefined}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}
