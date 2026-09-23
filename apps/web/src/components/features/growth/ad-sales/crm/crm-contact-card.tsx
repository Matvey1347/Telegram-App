"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type {
  CrmContactListItem,
  CrmTagSummary,
} from "@telegram-system/shared";
import {
  BellOff,
  BellRing,
  CircleDollarSign,
  Contact,
  Link2,
  Link2Off,
  MessageSquare,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import {
  CrmContactRevenue,
  DealMembersPreview,
  formatCrmContactDateTime,
} from "./crm-contact-card-support";
import type { CrmContactAction } from "./crm-contact-action-modal";
import {
  CrmTagEmoji,
  CrmTelegramFolderBadge,
  crmTagDisplayName,
} from "./crm-tag-presentation";

export function CrmContactCard({
  contact,
  canViewSales,
  canEdit = false,
  replyMutePending = false,
  onReplyMuteChange = () => undefined,
  onAction,
}: {
  contact: CrmContactListItem;
  canViewSales: boolean;
  /** Retained for callers while the card no longer exposes Create deal. */
  canCreateSales?: boolean;
  canEdit?: boolean;
  replyMutePending?: boolean;
  onReplyMuteChange?: (muted: boolean) => void;
  onAction: (action: CrmContactAction) => void;
}) {
  const telegramUsername = contact.telegramUsername?.replace(/^@+/, "") || null;
  const displayName = contact.displayName.replace(/^@+/, "").trim();
  const repeatedUsername =
    telegramUsername?.toLocaleLowerCase() === displayName.toLocaleLowerCase();
  const hasDeals = contact.salesSummary.totalSalesCount > 0;
  const needsReply =
    !contact.replySummary.muted &&
    contact.replySummary.status !== "NONE" &&
    contact.replySummary.status !== "WAITING_FOR_CLIENT";
  return (
    <article
      className={`break-inside-avoid rounded-xl border p-3.5 shadow-sm transition-colors ${
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
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-white">
                  {displayName || telegramUsername || contact.displayName}
                </h3>
              </div>
              {!repeatedUsername || contact.companyName ? (
                <p className="mt-1 truncate text-sm text-neutral-400">
                  {!repeatedUsername ? telegramUsername || "No username" : null}
                  {!repeatedUsername && contact.companyName ? " · " : null}
                  {contact.companyName}
                </p>
              ) : null}
              <TelegramConnectionStatus
                connected={Boolean(contact.replySummary.hasTelegramConversation)}
              />
            </div>
          </div>
        )}
        {!contact.isUnassignedClient ? (
          <ContactActionsMenu
            contact={contact}
            canViewSales={canViewSales}
            onAction={onAction}
          />
        ) : null}
      </div>

      {!contact.isUnassignedClient && contact.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-neutral-900 pt-2.5">
          {contact.tags.slice(0, 3).map((tag) => (
            <ContactTag key={tag.id} tag={tag} />
          ))}
          {contact.tags.length > 3 ? (
            <span className="inline-flex items-center rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
              +{contact.tags.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {contact.crossPromotions?.length ? (
        <section className="mt-3 border-t border-neutral-900 pt-3" aria-label="Mutual promotions">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            🤝 Mutual promotions
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contact.crossPromotions.map((plan) => (
              <Link
                key={plan.id}
                href={`/ad-campaigns/cross-promotion-plans?planId=${encodeURIComponent(plan.id)}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-violet-800/70 bg-violet-950/20 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-950/45"
                title={`${plan.kind} · ${plan.status}`}
              >
                <span className="truncate">{plan.title}</span>
                <span className="text-violet-400">↗</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {!contact.isUnassignedClient &&
      (contact.salesSummary.purchaseAudience ||
        (contact.salesSummary.purchasedChannels?.length ?? 0)) ? (
        <PurchasedChannels contact={contact} />
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

function ContactTag({ tag }: { tag: CrmTagSummary }) {
  const color = tag.color ?? "#737373";
  return (
    <span
      className="inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium"
      style={{
        borderColor: `${color}80`,
        backgroundColor: `${color}22`,
        color,
      }}
      title={tag.name}
    >
      <CrmTagEmoji tag={tag} />
      <span className="truncate">{crmTagDisplayName(tag)}</span>
      <CrmTelegramFolderBadge tag={tag} />
    </span>
  );
}

function PurchasedChannels({ contact }: { contact: CrmContactListItem }) {
  const [open, setOpen] = useState(false);
  const channels = contact.salesSummary.purchasedChannels ?? [];
  const audience = contact.salesSummary.purchaseAudience;
  const label =
    audience === "ALL"
      ? "All"
      : audience === "BUSINESS"
        ? "Business"
        : "Improvement";
  return (
    <section className="mt-3 border-t border-neutral-900 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        Advertising purchased in
      </p>
      <div className="mt-2 flex items-center gap-2">
        {audience ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-900 bg-sky-950/40 px-2 py-0.5 text-[11px] font-medium text-sky-200">
            <IconAvatar
              icon={
                contact.salesSummary.purchaseAudienceIcon ?? {
                  type: "unicode",
                  value:
                    audience === "ALL"
                      ? "✈️"
                      : audience === "BUSINESS"
                        ? "💼"
                        : "🧘",
                }
              }
              label={label}
              size="xs"
            />
            {label}
          </span>
        ) : null}
        {channels.length ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex -space-x-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`View ${channels.length} purchased channels`}
          >
            {channels.slice(0, 5).map((channel) => (
              <TelegramEntityAvatar
                key={channel.id}
                imageUrl={channel.photoUrl}
                alt=""
                kind="channel"
                size="xs"
              />
            ))}
            {channels.length > 5 ? (
              <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 px-1 text-[9px] text-white">
                +{channels.length - 5}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Purchased channels"
        size="sm"
      >
        <div className="space-y-2">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-2.5"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                alt=""
                kind="channel"
                size="sm"
              />
              <span className="text-sm text-white">{channel.title}</span>
            </div>
          ))}
        </div>
      </Modal>
    </section>
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
        {contact.nextContactAt ? (
          <InfoRow
            label="Next contact"
            value={formatCrmContactDateTime(contact.nextContactAt)}
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
  { id: "reminder", label: "Reminder", icon: BellRing },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "info", label: "Contact info", icon: Contact },
];

function ContactActionsMenu({
  contact,
  canViewSales,
  onAction,
}: {
  contact: CrmContactListItem;
  canViewSales: boolean;
  onAction: (action: CrmContactAction) => void;
}) {
  return (
    <TelegramCardActionsMenu label={`Actions for ${contact.displayName}`}>
      {contactActions
        .filter(
          (action) =>
            (!action.requiresSales || canViewSales) &&
            (action.id !== "conversations" ||
              Boolean(contact.replySummary.hasTelegramConversation)),
        )
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
    </TelegramCardActionsMenu>
  );
}

function TelegramConnectionStatus({ connected }: { connected: boolean }) {
  const Icon = connected ? Link2 : Link2Off;
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 text-[10px] ${
        connected ? "text-sky-400/80" : "text-neutral-500"
      }`}
      title={
        connected
          ? "A Telegram conversation is synchronized for this contact"
          : "No Telegram conversation is synchronized for this contact"
      }
    >
      <Icon size={11} aria-hidden="true" />
      {connected ? "Telegram synced" : "Not synced with Telegram"}
    </span>
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
