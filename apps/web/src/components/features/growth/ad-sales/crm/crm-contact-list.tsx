"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  CircleDollarSign,
  Contact,
  ListTodo,
  MessageSquare,
  Plus,
} from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CrmContactListItem } from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  MasonryGrid,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { IconAvatar } from "@/components/icons/icon-avatar";
import {
  telegramCrmApi,
  type CrmContactsParams,
} from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { crmText } from "./crm-copy";
import { Pagination } from "@/components/ui/pagination";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { crmPermissions } from "./crm-permissions";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
  TelegramCardMenuLink,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import {
  CrmContactActionModal,
  type CrmContactAction,
} from "./crm-contact-action-modal";
import { crmContactStagePresentation } from "./crm-contact-stage";

function when(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

export function CrmContactCard({
  contact,
  canViewSales,
  canCreateSales,
  onAction,
}: {
  contact: CrmContactListItem;
  canViewSales: boolean;
  canCreateSales: boolean;
  onAction: (action: CrmContactAction) => void;
}) {
  const telegramUsername = contact.telegramUsername?.replace(/^@+/, "") || null;
  const displayName = contact.displayName.replace(/^@+/, "").trim();
  const repeatedUsername =
    telegramUsername?.toLocaleLowerCase() === displayName.toLocaleLowerCase();
  const stage = crmContactStagePresentation(contact.stage);
  return (
    <article className="break-inside-avoid rounded-lg border border-neutral-800 bg-neutral-950 p-3 transition-colors hover:border-neutral-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TelegramEntityAvatar
            imageUrl={
              contact.peer?.photoUrl ??
              (telegramUsername
                ? `https://t.me/i/userpic/320/${telegramUsername}.jpg`
                : undefined)
            }
            alt={contact.displayName}
            kind="person"
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-white">
                {displayName || telegramUsername || contact.displayName}
              </h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${stage.className}`}
              >
                {stage.label}
              </span>
            </div>
            {!repeatedUsername || contact.companyName ? (
              <p className="mt-1 truncate text-sm text-neutral-400">
                {!repeatedUsername ? telegramUsername || "No username" : null}
                {!repeatedUsername && contact.companyName ? " · " : null}
                {contact.companyName}
              </p>
            ) : null}
          </div>
        </div>
        <ContactActionsMenu
          contact={contact}
          canViewSales={canViewSales}
          canCreateSales={canCreateSales}
          onAction={onAction}
        />
      </div>

      {contact.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-neutral-300">
          {contact.description}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-900 pt-3 text-sm sm:grid-cols-4">
        <Metric
          label="Revenue"
          value={
            <NativeMoney amounts={contact.salesSummary.revenueByCurrency} />
          }
        />
        <Metric
          label="Orders"
          value={String(contact.salesSummary.totalSalesCount)}
        />
        <Metric
          label="Paid"
          value={`${contact.salesSummary.paidSalesCount} / ${contact.salesSummary.totalSalesCount}`}
        />
        <Metric
          label="Placements"
          value={String(contact.salesSummary.totalPlacementsCount)}
        />
      </div>

      <div className="mt-3 border-t border-neutral-900 pt-2 text-xs">
        <InfoRow
          label="Owner"
          value={
            contact.ownerMember ? (
              <span className="inline-flex items-center justify-end gap-2">
                <IconAvatar
                  icon={contact.ownerMember.avatarPresentation}
                  label={contact.ownerMember.name}
                  size="xs"
                />
                <span className="truncate">{contact.ownerMember.name}</span>
              </span>
            ) : (
              "Unassigned"
            )
          }
        />
        {contact.lastContactAt ? (
          <InfoRow label="Last contact" value={when(contact.lastContactAt)} />
        ) : null}
        {contact.nextOpenTask?.dueAt || contact.nextContactAt ? (
          <InfoRow
            label="Next contact"
            value={when(contact.nextOpenTask?.dueAt ?? contact.nextContactAt)}
          />
        ) : null}
        {contact.salesSummary.lastDealAt ? (
          <InfoRow
            label="Last deal"
            value={when(contact.salesSummary.lastDealAt)}
          />
        ) : null}
        {contact.activeDeal || contact.activeDealCount ? (
          <InfoRow
            label="Active deal"
            value={
              contact.activeDeal
                ? `${contact.activeDeal.title || "Deal"} · ${contact.activeDeal.agreedAmount} ${contact.activeDeal.settlementCurrency}`
                : `${contact.activeDealCount} active`
            }
          />
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {contact.conversationAccounts.length ? (
            <span className="truncate text-neutral-500">
              via{" "}
              {contact.conversationAccounts
                .map((account) =>
                  account.username
                    ? `@${account.username.replace(/^@/, "")}`
                    : account.label,
                )
                .join(", ")}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

const contactActions: Array<{
  id: CrmContactAction;
  label: string;
  icon: typeof MessageSquare;
  requiresSales?: boolean;
}> = [
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  {
    id: "deals",
    label: "Deals",
    icon: CircleDollarSign,
    requiresSales: true,
  },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "notes", label: "Notes / Activities", icon: Activity },
  { id: "info", label: "Contact info", icon: Contact },
];

function ContactActionsMenu({
  contact,
  canViewSales,
  canCreateSales,
  onAction,
}: {
  contact: CrmContactListItem;
  canViewSales: boolean;
  canCreateSales: boolean;
  onAction: (action: CrmContactAction) => void;
}) {
  return (
    <TelegramCardActionsMenu label={`Actions for ${contact.displayName}`}>
      {contactActions
        .filter((action) => !action.requiresSales || canViewSales)
        .map((action) => {
          const Icon = action.icon;
          return (
            <TelegramCardMenuAction
              key={action.id}
              label={action.label}
              icon={<Icon size={17} />}
              onClick={() => onAction(action.id)}
            />
          );
        })}
      {canCreateSales ? (
        <>
          <div className="my-1 border-t border-neutral-800" />
          <TelegramCardMenuLink
            label="Create deal"
            href={`/ad-sales/sales?contactId=${encodeURIComponent(contact.id)}&createDeal=1`}
            icon={<Plus size={17} />}
          />
        </>
      ) : null}
    </TelegramCardActionsMenu>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1 font-medium text-white">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-neutral-300">
        {value}
      </span>
    </div>
  );
}

function formatAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    amount,
  );
}

function NativeMoney({
  amounts,
}: {
  amounts: CrmContactListItem["salesSummary"]["revenueByCurrency"];
}) {
  if (!amounts.length) return <span className="text-neutral-500">—</span>;
  return (
    <span className="flex flex-col gap-0.5 tabular-nums">
      {amounts.map((item) => (
        <span key={item.currency}>
          {formatAmount(item.amount)} {item.currency}
        </span>
      ))}
    </span>
  );
}

export function CrmContactList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [localSelectedAction, setLocalSelectedAction] = useState<{
    contactId: string;
    action: CrmContactAction;
  } | null>(null);
  const persistedContactId = searchParams.get("crmContact");
  const [openChatIds, setOpenChatIds] = useState<string[]>(() => {
    const stored =
      searchParams.get("crmChats")?.split(",").filter(Boolean) ?? [];
    return stored.length
      ? stored
      : persistedContactId
        ? [persistedContactId]
        : [];
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(() =>
    searchParams.get("crmAction") === "conversations"
      ? persistedContactId
      : null,
  );
  const persistChats = (ids: string[], active: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (ids.length && active) {
      next.set("crmChats", ids.join(","));
      next.set("crmContact", active);
      next.set("crmAction", "conversations");
    } else {
      next.delete("crmChats");
      next.delete("crmContact");
      next.delete("crmAction");
    }
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, {
      scroll: false,
    });
  };
  const openAction = (contactId: string, action: CrmContactAction) => {
    if (action !== "conversations") {
      setLocalSelectedAction({ contactId, action });
      return;
    }
    const nextIds = openChatIds.includes(contactId)
      ? openChatIds
      : [...openChatIds, contactId];
    setOpenChatIds(nextIds);
    setActiveChatId(contactId);
    persistChats(nextIds, contactId);
  };
  const closeChat = (contactId: string) => {
    const nextIds = openChatIds.filter((id) => id !== contactId);
    const nextActive = nextIds.at(-1) ?? null;
    setOpenChatIds(nextIds);
    setActiveChatId(nextActive);
    persistChats(nextIds, nextActive);
  };
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const params = useMemo<CrmContactsParams>(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      archived: false,
    }),
    [deferredSearch, page, pageSize],
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
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search contacts"
          aria-label="Search contacts"
          className="sm:max-w-sm"
        />
      </div>
      {query.isLoading ? (
        <LoadingState text={crmText("states.loadingContacts")} />
      ) : null}
      {query.error ? (
        <div className="py-6 text-center">
          <p className="mb-2 text-sm text-rose-300">
            Contacts could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!query.isLoading && !query.error && !query.data?.items.length ? (
        <EmptyState text={crmText("states.emptyContacts")} />
      ) : null}
      {query.data?.items.length ? (
        <div aria-label="Contacts">
          <MasonryGrid>
            {query.data.items.map((contact) => (
              <CrmContactCard
                key={contact.id}
                contact={contact}
                canViewSales={permissions.canViewSales}
                canCreateSales={permissions.canCreateSales}
                onAction={(action) => openAction(contact.id, action)}
              />
            ))}
          </MasonryGrid>
        </div>
      ) : null}
      {query.data ? (
        <Pagination
          {...query.data.pagination}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
          loading={query.isFetching}
        />
      ) : null}
      {localSelectedAction ? (
        <CrmContactActionModal
          contactId={localSelectedAction.contactId}
          action={localSelectedAction.action}
          onClose={() => setLocalSelectedAction(null)}
        />
      ) : null}
      {activeChatId ? (
        <CrmContactActionModal
          contactId={activeChatId}
          action="conversations"
          chatContactIds={openChatIds}
          onSelectChat={(contactId) => {
            setActiveChatId(contactId);
            persistChats(openChatIds, contactId);
          }}
          onCloseChat={closeChat}
          onClose={() => closeChat(activeChatId)}
        />
      ) : null}
    </section>
  );
}
