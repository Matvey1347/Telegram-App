"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  CrmContactListItem,
  CrmContactStage,
  CrmFollowUpView,
} from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import { Button, EmptyState, Input, LoadingState, Select } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  telegramCrmApi,
  type CrmContactsParams,
} from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";
import type { CrmListView } from "./crm-routes";
import { Pagination } from "@/components/ui/pagination";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";

const followUpOptions: Array<{ value: CrmFollowUpView; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "WAITING_FOR_REPLY", label: "Waiting for reply" },
  { value: "WROTE_NO_REPLY", label: "Wrote, no reply" },
  { value: "READ_NO_REPLY", label: "Read, no reply" },
];

function viewParams(view: CrmListView): Pick<CrmContactsParams, "stage" | "archived"> {
  const stage: Partial<Record<CrmListView, CrmContactStage>> = {
    LEADS: "LEAD",
    QUALIFIED: "QUALIFIED",
    CUSTOMERS: "CUSTOMER",
    LOST_ARCHIVED: "LOST",
  };
  return {
    ...(stage[view] ? { stage: stage[view] } : {}),
    ...(view === "LOST_ARCHIVED" ? { archived: false } : { archived: false }),
  };
}

function nextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function todayRange(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  const dateKey = `${value("year")}-${value("month")}-${value("day")}`;
  const from = zonedDateTimeToUtc(dateKey, "00:00", timezone);
  const next = zonedDateTimeToUtc(nextDateKey(dateKey), "00:00", timezone);
  return {
    dueFrom: from.toISOString(),
    dueTo: new Date(next.getTime() - 1).toISOString(),
  };
}

function when(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

export function CrmContactCard({ contact }: { contact: CrmContactListItem }) {
  return (
    <li>
      <Link
        href={`/ad-sales/contacts/${encodeURIComponent(contact.id)}`}
        className="block rounded-xl border border-neutral-800 bg-neutral-900/55 p-4 transition hover:border-neutral-700 hover:bg-neutral-900"
      >
        <div className="flex items-start gap-3">
          <TelegramEntityAvatar
            imageUrl={contact.peer?.photoUrl ?? undefined}
            alt={contact.displayName}
            kind="person"
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-medium text-white">{contact.displayName}</h2>
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
                {contact.stage.replace("_", "-")}
              </span>
              {contact.unreadCount ? (
                <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[11px] font-semibold text-neutral-950">
                  {contact.unreadCount} unread
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-sm text-neutral-400">
              {contact.telegramUsername ? `@${contact.telegramUsername.replace(/^@/, "")}` : "No username"}
              {contact.companyName ? ` · ${contact.companyName}` : ""}
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-neutral-300">
              {contact.lastMessage?.text || "No messages yet"}
            </p>
            {contact.lastMessage ? <p className="mt-1 text-[11px] text-neutral-500">{contact.lastMessage.direction} · {formatDateTime(contact.lastMessage.sentAt)}</p> : null}
          </div>
          <span className={`shrink-0 text-[11px] font-medium ${contact.automatedMessagesEnabled ? "text-emerald-300" : "text-neutral-500"}`}>
            {crmText(contact.automatedMessagesEnabled ? "automation.on" : "automation.off")}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-neutral-600">Owner</dt><dd>{contact.ownerMember?.name || "Unassigned"}</dd></div>
          <div><dt className="text-neutral-600">Last contact</dt><dd>{when(contact.lastContactAt)}</dd></div>
          <div><dt className="text-neutral-600">Next contact</dt><dd>{when(contact.nextOpenTask?.dueAt ?? contact.nextContactAt)}</dd></div>
          <div><dt className="text-neutral-600">Active deal</dt><dd>{contact.activeDeal ? `${contact.activeDeal.title || "Deal"} · ${contact.activeDeal.placementCount} placements · ${contact.activeDeal.agreedAmount} ${contact.activeDeal.settlementCurrency} · ${contact.activeDeal.paymentStatus}` : contact.activeDealCount ? `${contact.activeDealCount} active` : "None"}</dd>{contact.activeDeal?.scheduledAt ? <dd>{formatDateTime(contact.activeDeal.scheduledAt)}</dd> : null}</div>
        </dl>
        {contact.conversationAccounts.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contact.conversationAccounts.map((account) => (
              <span key={account.id} className="rounded-md bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300">
                via {account.username ? `@${account.username.replace(/^@/, "")}` : account.label}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

export function CrmContactList({ view }: { view: CrmListView }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const followUpParam = searchParams.get("followUp");
  const followUpView = followUpOptions.some((item) => item.value === followUpParam) ? followUpParam as CrmFollowUpView : "TODAY";
  const showArchived = searchParams.get("view") === "archived";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, staleTime: 5 * 60_000 });
  const dueRange = useMemo(
    () => todayRange(me.data?.workspace.timezone || "Europe/Warsaw"),
    [me.data?.workspace.timezone],
  );
  const params = useMemo<CrmContactsParams>(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      ...viewParams(view),
      ...(view === "FOLLOW_UP" ? {
        followUpView,
        ...(followUpView === "TODAY" ? dueRange : {}),
      } : {}),
      ...(view === "LOST_ARCHIVED" && showArchived
        ? { stage: "ARCHIVED", archived: true }
        : {}),
    }),
    [deferredSearch, dueRange, followUpView, page, pageSize, showArchived, view],
  );
  const query = useQuery({
    queryKey: telegramCrmKeys.contactList(params),
    queryFn: ({ signal }) => telegramCrmApi.listContacts(params, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search contacts"
          aria-label="Search contacts"
          className="sm:max-w-sm"
        />
        {view === "FOLLOW_UP" ? (
          <Select value={followUpView} onChange={(event) => router.replace(`/ad-sales?view=follow-up&followUp=${event.target.value}`)} aria-label="Follow-up view">
            {followUpOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        ) : null}
        {view === "LOST_ARCHIVED" ? (
          <Select value={showArchived ? "archived" : "lost"} onChange={(event) => router.replace(`/ad-sales?view=${event.target.value}`)} aria-label="Lost or archived">
            <option value="lost">Lost</option><option value="archived">Archived</option>
          </Select>
        ) : null}
      </div>
      {query.isLoading ? <LoadingState text={crmText("states.loadingContacts")} /> : null}
      {query.error ? <div className="py-6 text-center"><p className="mb-2 text-sm text-rose-300">Contacts could not be loaded.</p><Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></div> : null}
      {!query.isLoading && !query.error && !query.data?.items.length ? <EmptyState text={crmText("states.emptyContacts")} /> : null}
      {query.data?.items.length ? (
        <ol className="space-y-3" aria-label="Contacts">
          {query.data.items.map((contact) => <CrmContactCard key={contact.id} contact={contact} />)}
        </ol>
      ) : null}
      {query.data ? <Pagination {...query.data.pagination} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} loading={query.isFetching} /> : null}
    </section>
  );
}
