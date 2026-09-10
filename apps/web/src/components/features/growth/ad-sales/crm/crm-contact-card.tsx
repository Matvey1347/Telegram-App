"use client";

import type { ReactNode } from "react";
import type {
  CrmContactListItem,
  CrmContactStage,
} from "@telegram-system/shared";
import {
  Activity,
  BellOff,
  BellRing,
  CircleDollarSign,
  Contact,
  ListTodo,
  MessageSquare,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { CustomSelect } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
  TelegramCardMenuLink,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import {
  CrmContactRevenue,
  DealMembersPreview,
  formatCrmContactDateTime,
} from "./crm-contact-card-support";
import type { CrmContactAction } from "./crm-contact-action-modal";
import {
  crmContactStagePresentation,
  crmContactStages,
} from "./crm-contact-stage";

export function CrmContactCard({
  contact,
  canViewSales,
  canCreateSales,
  canEdit = false,
  stagePending = false,
  replyMutePending = false,
  onStageChange = () => undefined,
  onReplyMuteChange = () => undefined,
  onAction,
}: {
  contact: CrmContactListItem;
  canViewSales: boolean;
  canCreateSales: boolean;
  canEdit?: boolean;
  stagePending?: boolean;
  replyMutePending?: boolean;
  onStageChange?: (stage: CrmContactStage) => void;
  onReplyMuteChange?: (muted: boolean) => void;
  onAction: (action: CrmContactAction) => void;
}) {
  const telegramUsername = contact.telegramUsername?.replace(/^@+/, "") || null;
  const displayName = contact.displayName.replace(/^@+/, "").trim();
  const repeatedUsername =
    telegramUsername?.toLocaleLowerCase() === displayName.toLocaleLowerCase();
  const stage = crmContactStagePresentation(contact.stage);
  const hasDeals = contact.salesSummary.totalSalesCount > 0;
  const needsReply =
    !contact.replySummary.muted &&
    contact.replySummary.status !== "NONE" &&
    contact.replySummary.status !== "WAITING_FOR_CLIENT";
  return (
    <article
      className={`break-inside-avoid rounded-lg border p-3 transition-colors ${
        contact.isUnassignedClient
          ? "border-dashed border-amber-800/70 bg-amber-950/10 hover:border-amber-700"
          : needsReply
            ? "border-rose-800/80 bg-rose-950/10 hover:border-rose-700"
            : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {contact.isUnassignedClient ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-label="Unassigned client icon"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-800/70 bg-amber-950/30 text-amber-300"
            >
              <UserRound size={22} aria-hidden="true" />
              <X
                size={12}
                strokeWidth={3}
                className="absolute bottom-1 right-0.5 rounded-full bg-amber-950"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-white">
                Client not specified
              </h3>
              <p className="mt-1 truncate text-sm text-amber-200/70">
                Deals created without selecting a client
              </p>
            </div>
          </div>
        ) : (
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
                <div
                  aria-label={`Stage for ${contact.displayName}`}
                  className={`w-fit [&>div>button]:min-h-0 [&>div>button]:rounded-full [&>div>button]:px-1.5 [&>div>button]:py-0.5 [&>div>button]:text-[11px] [&>div>button]:font-medium ${stage.selectClassName}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <CustomSelect
                    value={contact.stage}
                    disabled={!canEdit || stagePending}
                    searchable={false}
                    dropdownClassName="!w-44 [&_button]:px-2 [&_button]:py-1.5"
                    onChange={(value) =>
                      onStageChange(value as CrmContactStage)
                    }
                    options={crmContactStages.map((value) => {
                      const presentation = crmContactStagePresentation(value);
                      return {
                        value,
                        label: presentation.label,
                        tone: presentation.tone,
                        badgeClassName: `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0 text-[11px] leading-5 ${presentation.className}`,
                      };
                    })}
                  />
                </div>
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
        )}
        {!contact.isUnassignedClient ? (
          <ContactActionsMenu
            contact={contact}
            canViewSales={canViewSales}
            canCreateSales={canCreateSales}
            onAction={onAction}
          />
        ) : null}
      </div>

      {contact.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-neutral-300">
          {contact.description}
        </p>
      ) : null}
      {!contact.isUnassignedClient && contact.replySummary.status !== "NONE" ? (
        <ReplySummary
          contact={contact}
          canMute={canEdit}
          pending={replyMutePending}
          onMuteChange={onReplyMuteChange}
        />
      ) : null}
      {hasDeals ? <DealSummary contact={contact} /> : null}
    </article>
  );
}

function ReplySummary({
  contact,
  canMute,
  pending,
  onMuteChange,
}: {
  contact: CrmContactListItem;
  canMute: boolean;
  pending: boolean;
  onMuteChange: (muted: boolean) => void;
}) {
  const summary = contact.replySummary;
  const established = summary.status.startsWith("CONVERSATION_");
  const unread = summary.status.endsWith("_UNREAD");
  const first = summary.status.startsWith("FIRST_");
  const waitingForClient = summary.status === "WAITING_FOR_CLIENT";
  const suffix = summary.countsComplete ? "" : "+";
  const label = waitingForClient
    ? "Waiting for client"
    : first
      ? unread
        ? "First message · unread"
        : "First message · read"
      : unread
        ? "Awaiting reply · unread"
        : "Awaiting reply · read";
  return (
    <div
      className={`mt-3 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${summary.muted ? "border-neutral-800 bg-neutral-900/35 text-neutral-500" : unread ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-neutral-800 bg-neutral-900/45 text-neutral-300"}`}
    >
      {unread && !summary.muted ? (
        <BellRing
          size={14}
          className="shrink-0 text-rose-300"
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {summary.muted ? "Reply alert muted" : label}
      </span>
      <span
        className="shrink-0 tabular-nums text-neutral-500"
        aria-label={`${summary.inboundMessageCount} inbound, ${summary.outboundMessageCount} outbound messages${summary.countsComplete ? "" : " or more"}`}
      >
        In {summary.inboundMessageCount}
        {suffix} · Out {summary.outboundMessageCount}
        {suffix}
      </span>
      {established && canMute ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onMuteChange(!summary.muted)}
          aria-label={
            summary.muted
              ? `Restore reply alert for ${contact.displayName}`
              : `Mute reply alert for ${contact.displayName}`
          }
          title={summary.muted ? "Restore reply alert" : "Mute reply alert"}
          className="-m-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
        >
          <BellOff size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function DealSummary({ contact }: { contact: CrmContactListItem }) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-900 pt-3 text-sm sm:grid-cols-4">
        <Metric
          label="Revenue"
          value={
            <CrmContactRevenue
              amounts={contact.salesSummary.revenueByCurrency}
            />
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
          label="Members"
          allowOverflow
          value={
            contact.salesSummary.dealMembers.length ? (
              <DealMembersPreview members={contact.salesSummary.dealMembers} />
            ) : (
              "Unassigned"
            )
          }
        />
        {contact.lastContactAt ? (
          <InfoRow
            label="Last contact"
            value={formatCrmContactDateTime(contact.lastContactAt)}
          />
        ) : null}
        {contact.nextOpenTask?.dueAt || contact.nextContactAt ? (
          <InfoRow
            label="Next contact"
            value={formatCrmContactDateTime(
              contact.nextOpenTask?.dueAt ?? contact.nextContactAt,
            )}
          />
        ) : null}
        {contact.salesSummary.lastDealAt ? (
          <InfoRow
            label="Last deal"
            value={formatCrmContactDateTime(contact.salesSummary.lastDealAt)}
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
      </div>
    </>
  );
}

const contactActions: Array<{
  id: CrmContactAction;
  label: string;
  icon: typeof MessageSquare;
  requiresSales?: boolean;
}> = [
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  { id: "deals", label: "Deals", icon: CircleDollarSign, requiresSales: true },
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
function InfoRow({
  label,
  value,
  allowOverflow = false,
}: {
  label: string;
  value: ReactNode;
  allowOverflow?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span
        className={`min-w-0 text-right text-neutral-300 ${allowOverflow ? "overflow-visible" : "truncate"}`}
      >
        {value}
      </span>
    </div>
  );
}
