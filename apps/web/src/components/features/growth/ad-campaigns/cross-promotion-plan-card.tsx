"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Clock3,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramChannelAvatarList } from "@/components/features/telegram/telegram/telegram-channel-avatar-list";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import { formatDateTime } from "@/lib/date-format";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion/mutual-promotion-folder-status-badge";

export function CrossPromotionPlanCard({
  plan,
  clock,
  onCopy,
  onEdit,
  onDelete,
}: {
  plan: CrossPromotionPlan;
  clock: number | null;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const joined = plan.targetResults.reduce(
    (sum, target) => sum + target.joinedCount + target.requestedCount,
    0,
  );
  const lost = plan.publisherResults.reduce(
    (sum, channel) => sum + (channel.subscribersLost ?? 0),
    0,
  );
  const views = plan.publisherResults.reduce(
    (sum, channel) => sum + (channel.postViews ?? 0),
    0,
  );
  const publishingChannels = plan.publisherResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const canEdit = plan.status === "DRAFT" || plan.status === "SCHEDULED";
  const advertiser = advertiserPresentation(plan.advertiser);

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
              <CalendarClock size={14} /> {formatDateTime(plan.scheduledAt)}
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
              <CardMenuAction
                label="Duplicate mutual promotion"
                icon={<Copy size={16} />}
                onClick={onCopy}
              />
              {canEdit ? (
                <CardMenuAction
                  label="Edit promotion"
                  icon={<Pencil size={16} />}
                  onClick={onEdit}
                />
              ) : null}
              {plan.status === "DRAFT" ? (
                <CardMenuAction
                  danger
                  label="Delete"
                  icon={<Trash2 size={16} />}
                  onClick={onDelete}
                />
              ) : null}
            </CardActionsMenu>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 divide-x divide-white/10 rounded-lg border border-white/5 bg-black/25 py-2">
        <Metric value={plan.placementPostIds.length} label="Posts" />
        <ChannelMetric channels={publishingChannels} label="My channels" />
      </div>

      {plan.status === "DRAFT" ? (
        <div className="mx-4 mt-3 rounded-lg border border-rose-900/70 bg-rose-950/20 p-3 text-xs text-rose-200">
          <p className="font-medium">This placement was not scheduled.</p>
          <p className="mt-1 text-rose-300/80">
            {plan.lastError || "Edit and retry, or delete this draft."}
          </p>
        </div>
      ) : null}

      <div className="mx-4 mt-3 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-black/20">
        {plan.targetResults.map((target) => (
          <div
            key={`target:${target.telegramChannelId}`}
            className="px-2.5 py-2"
          >
            <ChannelIdentity
              title={target.title}
              photoUrl={target.photoUrl}
              badge="Promoted"
              badgeClassName="bg-emerald-950 text-emerald-300"
            />
            <div className="mt-1.5 grid grid-cols-2 gap-2 pl-7 text-[10px]">
              <Stat
                label="Joined"
                value={`+${target.joinedCount + target.requestedCount}`}
                tone="text-emerald-300"
              />
              <Stat label="Promo" value={target.promoTitle} />
            </div>
          </div>
        ))}
        {plan.publisherResults.map((channel) => {
          const placement = plan.placementPostIds.find(
            (item) => item.telegramChannelId === channel.telegramChannelId,
          );
          const scheduledAt =
            plan.publicationPost.publisherPlacements?.find(
              (item) => item.telegramChannelId === channel.telegramChannelId,
            )?.scheduledAt ?? plan.scheduledAt;
          return (
            <div
              key={`publisher:${channel.telegramChannelId}`}
              className="px-2.5 py-2"
            >
              <ChannelIdentity
                title={channel.title}
                photoUrl={channel.photoUrl}
                badge="Publisher"
                badgeClassName="bg-blue-950 text-blue-300"
                action={
                  placement ? (
                    <Link
                      href={buildTelegramPostsUrl({
                        channelId: channel.telegramChannelId,
                        postId: placement.managedPostId,
                        postView: "editor",
                      })}
                      aria-label={`Open scheduled post for ${channel.title}`}
                      title="Open scheduled post"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sky-300 transition hover:bg-sky-950/50 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  ) : null
                }
              />
              <div className="mt-1.5 flex items-end justify-between gap-2 pl-7 text-[10px]">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <Stat
                    label="Views"
                    value={
                      channel.postViews == null
                        ? "—"
                        : channel.postViews.toLocaleString()
                    }
                  />
                  <Stat
                    label="Left ≈"
                    value={
                      channel.subscribersLost == null
                        ? "—"
                        : channel.subscribersLost.toLocaleString()
                    }
                    tone="text-rose-300"
                  />
                </div>
                <ChannelPostTimer value={scheduledAt} now={clock} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-white/10 px-4 py-2 text-xs text-neutral-500">
        +{joined} joined · −{lost} left · {views} views
      </div>
    </article>
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
  action,
}: {
  title: string;
  photoUrl: string | null;
  badge: string;
  badgeClassName: string;
  action?: ReactNode;
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
      {action}
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function ChannelMetric({
  channels,
  label,
}: {
  channels: Array<{ id: string; title: string; photoUrl: string | null }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center">
      <TelegramChannelAvatarList
        channels={channels}
        ariaLabel={`${label}: ${channels.length}`}
      />
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-neutral-600">{label}</p>
      <p className={`truncate font-medium tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ChannelPostTimer({
  value,
  now,
}: {
  value: string;
  now: number | null;
}) {
  const delta = now == null ? null : new Date(value).getTime() - now;
  const minutes = delta == null ? null : Math.ceil(Math.abs(delta) / 60_000);
  const duration =
    minutes == null
      ? formatDateTime(value)
      : minutes >= 1_440
        ? `${Math.ceil(minutes / 1_440)}d`
        : minutes >= 60
          ? `${Math.ceil(minutes / 60)}h`
          : `${minutes}m`;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[10px] text-neutral-400">
      <Clock3 size={11} />
      {delta == null || delta > 0 ? `in ${duration}` : "done"}
    </span>
  );
}
