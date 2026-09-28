"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import type {
  CrmContactListItem,
  CrmTagSummary,
} from "@telegram-system/shared";
import {
  BellRing,
  CircleDollarSign,
  Contact,
  MessageSquare,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";
import {
  CrmContactRevenue,
  CrmCardPreviewPopover,
  DealMembersPreview,
} from "./crm-contact-card-support";
import type { CrmContactAction } from "./crm-contact-action-modal";
import {
  CrmTagEmoji,
  CrmTelegramFolderBadge,
  crmTagDisplayName,
} from "./crm-tag-presentation";
import {
  CrmContactChannelMark,
  type CrmContactChannelName,
} from "./crm-contact-channel-mark";

export function CrmContactCard({
  contact,
  canViewSales,
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
  const hasDeals = contact.salesSummary.totalSalesCount > 0;
  const cardTags = contact.tags;
  return (
    <article
      className={`break-inside-avoid rounded-xl border p-3 shadow-sm transition-colors ${
        contact.isUnassignedClient
          ? "border-dashed border-amber-800/70 bg-amber-950/10 hover:border-amber-700"
          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
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
              <p className="truncate text-xs text-amber-200/70">
                Deals created without selecting a client
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
              <div className="flex min-w-0 items-center gap-1.5">
                <h3
                  className="max-w-[12rem] shrink truncate text-sm font-semibold text-white"
                  title={displayName || telegramUsername || contact.displayName}
                >
                  {displayName || telegramUsername || contact.displayName}
                </h3>
                {cardTags.length ? (
                  <div
                    className="flex min-w-0 flex-1 items-center gap-1 pr-2"
                    aria-label="Contact tags"
                  >
                    {cardTags.slice(0, 1).map((tag) => (
                      <ContactTag key={tag.id} tag={tag} />
                    ))}
                    {cardTags.length > 1 ? (
                      <CrmCardPreviewPopover
                        label={`Show all ${cardTags.length} contact tags`}
                        trigger={
                          <span className="inline-flex shrink-0 items-center rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                            +{cardTags.length - 1}
                          </span>
                        }
                      >
                        <div className="absolute right-0 top-full z-30 mt-2 min-w-44 space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
                          {cardTags.map((tag) => (
                            <div key={tag.id} className="px-1 py-1">
                              <ContactTag tag={tag} />
                            </div>
                          ))}
                        </div>
                      </CrmCardPreviewPopover>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <ContactChannelsStatus contact={contact} />
            </div>
          </div>
        )}
        {!contact.isUnassignedClient ? (
          <div className="flex shrink-0 items-center gap-1">
            {contact.nextContactAt ? (
              <button
                type="button"
                onClick={() => onAction("reminder")}
                aria-label={`Open reminder for ${contact.displayName}`}
                title={`Reminder: ${new Date(contact.nextContactAt).toLocaleString()}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-amber-300 transition hover:bg-amber-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <BellRing size={16} aria-hidden="true" />
              </button>
            ) : null}
            <ContactActionsMenu
              contact={contact}
              canViewSales={canViewSales}
              onAction={onAction}
            />
          </div>
        ) : null}
      </div>

      {contact.crossPromotions?.length ? (
        <div
          className="mt-2 flex gap-1 overflow-hidden"
          aria-label="Mutual promotions"
        >
          {contact.crossPromotions.slice(0, 2).map((plan) => (
            <Link
              key={plan.id}
              href={`/ad-campaigns/cross-promotion-plans?planId=${encodeURIComponent(plan.id)}`}
              className="inline-flex min-w-0 items-center gap-1 rounded-full border border-violet-800/70 bg-violet-950/20 px-1.5 py-0.5 text-[10px] text-violet-200 hover:bg-violet-950/45"
              title={`${plan.kind} · ${plan.status}`}
            >
              <span className="truncate">{plan.title}</span>
              <span className="text-violet-400">↗</span>
            </Link>
          ))}
        </div>
      ) : null}
      <DealSummary contact={contact} hasDeals={hasDeals} />
    </article>
  );
}

function ContactTag({ tag }: { tag: CrmTagSummary }) {
  const color = tag.color ?? "#737373";
  return (
    <span
      className="inline-flex max-w-36 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
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
  const channels = contact.salesSummary.purchasedChannels ?? [];
  return (
    channels.length ? (
      <CrmCardPreviewPopover
        label={`View ${channels.length} purchased channels`}
        trigger={
          <span className="flex -space-x-1 rounded-full">
          {channels.slice(0, 4).map((channel) => (
            <TelegramEntityAvatar
              key={channel.id}
              imageUrl={channel.photoUrl}
              alt=""
              kind="channel"
              size="xs"
            />
          ))}
          {channels.length > 4 ? (
            <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 px-1 text-[9px] text-white">
              +{channels.length - 4}
            </span>
          ) : null}
          </span>
        }
      >
        <div className="absolute right-0 top-full z-30 mt-2 min-w-56 space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center gap-2 px-1 py-1"
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
      </CrmCardPreviewPopover>
    ) : null
  );
}

function DealSummary({
  contact,
  hasDeals,
}: {
  contact: CrmContactListItem;
  hasDeals: boolean;
}) {
  if (!hasDeals) return null;
  return (
    <>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
        <Metric
          label="💰"
          value={
            <span className="inline-flex items-baseline gap-1.5">
              <span>{contact.salesSummary.totalSalesCount} -</span>
              <CrmContactRevenue
                amounts={contact.salesSummary.revenueByCurrency}
              />
            </span>
          }
        />
        <div className="min-w-0">
          <p className="text-xs uppercase text-neutral-500">📣</p>
          <div className="mt-1 flex justify-end">
            <PurchasedChannels contact={contact} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex min-h-5 items-center justify-between gap-3 text-[11px] text-neutral-400">
        <OwnerPreview contact={contact} />
        {hasDeals ? (
          contact.salesSummary.dealMembers.length ? (
            <DealMembersPreview members={contact.salesSummary.dealMembers} />
          ) : null
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

function OwnerPreview({ contact }: { contact: CrmContactListItem }) {
  if (!contact.ownerMember) return null;
  return (
    <span
      className="flex shrink-0"
      title={`Card owner: ${contact.ownerMember.name}`}
    >
      <IconAvatar
        icon={contact.ownerMember.avatarPresentation}
        label={contact.ownerMember.name}
        size="xs"
      />
    </span>
  );
}

function ContactChannelsStatus({ contact }: { contact: CrmContactListItem }) {
  const channels = contact.contactChannels;
  if (channels.length) {
    return (
      <span className="mt-1 flex items-center gap-1.5" aria-label="Contact channels">
        {channels.slice(0, 4).map((channel) => {
          const name = channelName(channel);
          return (
            <a
              key={channel.id}
              href={channelHref(channel)}
              target="_blank"
              rel="noreferrer"
              title={`${channel.isPrimary ? "Active contact: " : "Contact: "}${name}`}
              className={`inline-flex rounded-full p-0.5 transition-opacity hover:opacity-100 ${channel.isPrimary ? "opacity-100" : "opacity-40"}`}
            >
              <CrmContactChannelMark channel={name} className="h-4 w-4" />
            </a>
          );
        })}
      </span>
    );
  }
  return contact.replySummary.hasTelegramConversation ? (
    <span className="mt-1 flex items-center" title="Telegram contact">
      <CrmContactChannelMark channel="Telegram" className="h-3.5 w-3.5" />
    </span>
  ) : null;
}

function channelName(channel: CrmContactListItem["contactChannels"][number]): CrmContactChannelName {
  if (channel.type === "TELEGRAM_USERNAME" || channel.type === "TELEGRAM_USER_ID") return "Telegram";
  const label = channel.label?.toLowerCase();
  if (label === "instagram") return "Instagram";
  if (label === "whatsapp") return "WhatsApp";
  if (label === "threads") return "Threads";
  return "Other";
}

function channelHref(channel: CrmContactListItem["contactChannels"][number]) {
  if (channel.type === "TELEGRAM_USERNAME") return `https://t.me/${channel.value.replace(/^@+/, "")}`;
  return /^https?:\/\//i.test(channel.value) ? channel.value : `https://${channel.value}`;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-neutral-500">{label}</p>
      <p className="mt-0.5 font-medium text-white">{value}</p>
    </div>
  );
}
