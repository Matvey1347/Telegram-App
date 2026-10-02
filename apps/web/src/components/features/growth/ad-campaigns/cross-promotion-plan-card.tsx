"use client";

import { CalendarClock, Eye, Pencil, RefreshCw, Send, Trash2, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramChannelAvatarList } from "@/components/features/telegram/telegram/telegram-channel-avatar-list";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import { formatDateTime } from "@/lib/date-format";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion/mutual-promotion-folder-status-badge";

export function CrossPromotionPlanCard({
  plan,
  onEdit,
  onDelete,
  onResume,
  onSendToBot,
  onOpenPromo,
  onRefreshInviteLinks,
  refreshingInviteLinks = false,
}: {
  plan: CrossPromotionPlan;
  onEdit: (plan: CrossPromotionPlan) => void;
  onDelete: () => void;
  onResume?: (plan: CrossPromotionPlan) => void;
  onSendToBot?: (plan: CrossPromotionPlan) => void;
  onOpenPromo?: (promoId: string) => void;
  onRefreshInviteLinks?: (plan: CrossPromotionPlan) => void;
  refreshingInviteLinks?: boolean;
}) {
  const publishingChannels = plan.publisherResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const partnerChannels = plan.partnerResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const publisherPublicationCount =
    plan.publicationPost.publisherPublications?.length ?? 1;
  const partnerPublicationCount =
    plan.publicationPost.partnerPublications?.length ?? 1;
  const canEdit = plan.status !== "CANCELLED";
  const advertiser = advertiserPresentation(plan.advertiser);
  const placementTimes = plan.kind === "OWN_CHANNELS"
    ? (plan.publicationPost.publisherPlacements ?? []).map((placement) => placement.scheduledAt)
    : [];
  const cardScheduledAt = placementTimes.length
    ? placementTimes.reduce((earliest, current) => Date.parse(current) < Date.parse(earliest) ? current : earliest)
    : plan.scheduledAt;
  const publisherViews = sumKnown(
    plan.publisherResults.map((channel) => channel.postViews),
  );
  const publisherAudienceDecline = sumKnown(
    plan.publisherResults.map((channel) => channel.subscribersLost),
  );

  return (
    <article className="group relative break-inside-avoid rounded-2xl border border-neutral-800 bg-neutral-950/80 transition duration-200 hover:border-neutral-700">
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <IconAvatar
                icon={plan.iconPresentation}
                label={plan.title}
                size="xs"
                className="rounded-full"
              />
              <h2 className="truncate font-semibold text-white">
                {plan.title}
              </h2>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
              <CalendarClock size={14} /> {formatDateTime(cardScheduledAt)}
            </p>
            {plan.advertiser ? (
              <div className="mt-2 flex items-center gap-2">
                <TelegramEntityAvatar
                  imageUrl={advertiser.photoUrl}
                  kind="person"
                  alt={plan.advertiser.displayName}
                  size="sm"
                />
                <span className="truncate text-xs text-neutral-200">
                  {advertiser.label}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <MutualPromotionFolderStatusBadge status={plan.status} />
            <CardActionsMenu label={`Actions for ${plan.title}`}>
              {canEdit ? (
                <CardMenuAction
                  label={
                    plan.status === "DRAFT" && !plan.lastError
                      ? "Continue draft"
                      : "Edit promotion"
                  }
                  icon={<Pencil size={16} />}
                  onClick={() => onEdit(plan)}
                />
              ) : null}
              {plan.status === "DRAFT" && plan.lastError && onResume ? (
                <CardMenuAction
                  label="Continue scheduling"
                  icon={<RefreshCw size={16} />}
                  onClick={() => onResume(plan)}
                />
              ) : null}
              {onSendToBot ? (
                <CardMenuAction
                  label="Send schedule to bot"
                  icon={<Send size={16} />}
                  onClick={() => onSendToBot(plan)}
                />
              ) : null}
              {onRefreshInviteLinks ? (
                <CardMenuAction
                  label="Refresh invite-link data"
                  icon={<RefreshCw size={16} className={refreshingInviteLinks ? "animate-spin" : undefined} />}
                  disabled={refreshingInviteLinks}
                  onClick={() => onRefreshInviteLinks(plan)}
                />
              ) : null}
              <CardMenuAction
                danger
                label="Delete"
                icon={<Trash2 size={16} />}
                onClick={onDelete}
              />
            </CardActionsMenu>
          </div>
        </div>
      </div>

      <div className={`mx-4 mt-3 grid rounded-lg border border-white/5 bg-black/25 py-2 ${plan.kind === "OWN_CHANNELS" ? "grid-cols-1" : "grid-cols-2 divide-x divide-white/10"}`}>
        {plan.kind !== "OWN_CHANNELS" ? <ChannelMetric channels={partnerChannels} label="Partner channels" publicationCount={partnerPublicationCount} /> : null}
        <ChannelMetric channels={publishingChannels} label="My channels" publicationCount={publisherPublicationCount} />
      </div>

      {plan.status === "DRAFT" ? (
        <div
          className={`mx-4 mt-3 rounded-lg border p-3 text-xs ${plan.lastError ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-blue-900/70 bg-blue-950/20 text-blue-100"}`}
        >
          <p className="font-medium">
            {plan.lastError ? "This placement was not scheduled." : "Saved draft."}
          </p>
          <p className={plan.lastError ? "mt-1 text-rose-300/80" : "mt-1 text-blue-200/80"}>
            {plan.lastError || "Continue it from any device, or delete the draft when it is no longer needed."}
          </p>
        </div>
      ) : null}

      <div className="mx-4 mb-4 mt-3 overflow-hidden rounded-lg border border-neutral-800 bg-black/20">
        {plan.targetResults.map((target) => (
          <div
            key={`target:${target.telegramChannelId}:${target.inviteLinkId}`}
            className="px-2.5 py-2"
          >
            <ChannelIdentity
              title={target.title}
              photoUrl={target.photoUrl}
              badge="✨ Promoted"
              badgeClassName="bg-emerald-950 text-emerald-300"
            />
            <div className="mt-1.5 grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-end gap-x-3 pl-7 text-[10px]">
              <Stat
                label="During placement"
                icon={UserPlus}
                value={`+${(
                  target.joinedCount + target.requestedCount
                ).toLocaleString()}`}
                tone="text-emerald-300"
              />
              <Stat
                label="Audience decline"
                icon={UserMinus}
                value={
                  publisherAudienceDecline == null
                    ? "—"
                    : `−${publisherAudienceDecline.toLocaleString()}`
                }
                tone="text-rose-300"
              />
              <Stat
                label="Actual views"
                icon={Eye}
                value={
                  publisherViews == null ? "—" : publisherViews.toLocaleString()
                }
              />
              <PromoLink
                promoId={target.promoId}
                icon={target.promoIconPresentation}
                title={target.promoTitle}
                onOpenPromo={onOpenPromo}
              />
            </div>
          </div>
        ))}
      </div>

    </article>
  );
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function PromoLink({
  promoId,
  icon,
  title,
  onOpenPromo,
}: {
  promoId: string | null;
  icon: CrossPromotionPlan["targetResults"][number]["promoIconPresentation"];
  title: string;
  onOpenPromo?: (promoId: string) => void;
}) {
  const content = (
    <>
      <IconAvatar
        icon={icon}
        label={title}
        size="xs"
        className="shrink-0 rounded-full"
      />
      <span className="truncate">{title}</span>
    </>
  );
  const className =
    "flex min-w-0 items-center gap-1.5 truncate text-left text-neutral-200";
  return promoId && onOpenPromo ? (
    <button
      type="button"
      onClick={() => onOpenPromo(promoId)}
      title={`Promo: ${title}. Click to open its preview.`}
      className={`${className} hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function advertiserPresentation(advertiser: CrossPromotionPlan["advertiser"]) {
  if (!advertiser) return { label: "", photoUrl: null };
  const username = advertiser.telegramUsername?.replace(/^@+/, "").trim();
  const displayName = advertiser.displayName.trim();
  const comparableName = displayName.replace(/^@+/, "");
  const repeated =
    username?.toLocaleLowerCase() === comparableName.toLocaleLowerCase();
  const primaryLabel =
    displayName || (username ? `@${username}` : "Unnamed client");
  return {
    label:
      !repeated && displayName && username
        ? `${displayName} · @${username}`
        : primaryLabel,
    photoUrl:
      advertiser.photoUrl ||
      (username ? `https://t.me/i/userpic/320/${username}.jpg` : null),
  };
}

function ChannelIdentity({
  title,
  photoUrl,
  badge,
  badgeClassName,
}: {
  title: string;
  photoUrl: string | null;
  badge: string;
  badgeClassName: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TelegramEntityAvatar
        imageUrl={photoUrl}
        kind="channel"
        alt=""
        size="xs"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
        {title}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] ${badgeClassName}`}
      >
        {badge}
      </span>
    </div>
  );
}

function ChannelMetric({
  channels,
  label,
  publicationCount = 1,
}: {
  channels: Array<{ id: string; title: string; photoUrl: string | null }>;
  label: string;
  publicationCount?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center">
      <TelegramChannelAvatarList
        channels={channels}
        ariaLabel={`${label}: ${channels.length}`}
      />
      <p className="mt-0.5 text-[11px] text-neutral-500">
        {label}
        {publicationCount > 1 ? ` · ${publicationCount} publications` : ""}
      </p>
    </div>
  );
}

function Stat({
  label,
  icon: Icon,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  tone?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value}`}
      className={`inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-medium tabular-nums ${tone}`}
    >
      <Icon size={13} aria-hidden="true" className="shrink-0" />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}
