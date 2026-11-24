"use client";

import type { ReactNode } from "react";
import type { MutualPromotionFolderListItem } from "@telegram-system/shared";
import { CalendarClock, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { formatDateTime } from "@/lib/date-format";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion-folder-status-badge";
import { MutualPromotionPaidSubscriberPrice } from "./mutual-promotion-paid-subscriber-price";
import { MutualPromotionParticipantRoleBadge } from "./mutual-promotion-participant-role-badge";
import { CardActionsMenu, CardMenuAction } from "@/components/ui/card-actions-menu";

export function MutualPromotionFolderCard({
  folder,
  typeBadge,
  onOpen,
  onEdit,
  onRefreshInviteLinks,
  refreshingInviteLinks = false,
  onDelete,
}: {
  folder: MutualPromotionFolderListItem;
  typeBadge?: ReactNode;
  onOpen: () => void;
  onEdit?: () => void;
  onRefreshInviteLinks?: () => void;
  refreshingInviteLinks?: boolean;
  onDelete?: () => void;
}) {
  const title =
    (folder.titleTemplate?.includes("[date-range]")
      ? folder.titleTemplate
          .replaceAll("[date-range]", "")
          .replace(/\s*\/\/\s*$/, "")
          .trim()
      : folder.title.replace(/\s*\/\/\s*\d{4}-\d{2}-\d{2}\s+[—–-]\s+\d{4}-\d{2}-\d{2}$/, "").trim()) || "Folder";

  return (
    <article className="group relative rounded-2xl border border-neutral-800 bg-neutral-950/80 pb-3 transition duration-200 hover:border-neutral-700">
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-2xl focus-visible:!outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-600"
        onClick={onOpen}
        aria-label={`Open folder ${folder.title}`}
      />

      <div className="pointer-events-none relative z-10 px-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-semibold text-white">{title}</h3>
              {typeBadge}
            </div>
            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-neutral-400">
              <CalendarClock size={14} className="shrink-0" />
              <time className="whitespace-nowrap" dateTime={folder.startsAt}>{formatDateTime(folder.startsAt)}</time>
              <span className="text-neutral-600">→</span>
              <time className="whitespace-nowrap" dateTime={folder.endsAt}>{formatDateTime(folder.endsAt)}</time>
            </p>
          </div>
          <div className="pointer-events-auto flex items-start gap-1">
            {folder.status !== "COMPLETED" ? <MutualPromotionFolderStatusBadge status={folder.status} /> : null}
            {onEdit || onRefreshInviteLinks || onDelete ? (
              <CardActionsMenu label={`Actions for ${folder.title}`}>
                {onEdit ? (
                  <CardMenuAction label="Edit folder" icon={<Pencil size={16} />} onClick={onEdit} />
                ) : null}
                {onRefreshInviteLinks ? (
                  <CardMenuAction
                    label="Refresh invite-link data"
                    icon={<RefreshCw size={16} className={refreshingInviteLinks ? "animate-spin" : undefined} />}
                    disabled={refreshingInviteLinks}
                    onClick={onRefreshInviteLinks}
                  />
                ) : null}
                {onDelete ? (
                  <CardMenuAction danger label="Delete folder" icon={<Trash2 size={16} />} onClick={onDelete} />
                ) : null}
              </CardActionsMenu>
            ) : null}
          </div>
        </div>
      </div>

      <ChannelPerformance channels={folder.channels} />
    </article>
  );
}

function ChannelPerformance({ channels }: { channels: MutualPromotionFolderListItem["channels"] }) {
  if (!channels.length) return null;

  return (
    <div
      className="pointer-events-auto relative z-20 mx-3 mt-2 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-black/20"
      aria-label="Channel performance"
    >
      {channels.map((channel) => (
        <div key={`${channel.role}:${channel.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <TelegramEntityAvatar imageUrl={channel.photoUrl} alt="" kind="channel" size="xs" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">{channel.title}</span>
          </div>
          <dl className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
            <ChannelStat
              label="Joined + requests"
              value={channel.stats.acquiredCount == null ? "—" : `+${formatCount(channel.stats.acquiredCount)}`}
              tone="text-emerald-300"
            />
            {channel.role === "PUBLISHER" ? (
              <ChannelStat
                label="Estimated unsubscribes ≈"
                value={formatCount(channel.stats.unsubscribedCount)}
                tone="text-rose-300"
              />
            ) : null}
            {channel.role === "PAID" ? (
              <ChannelStat label="Price" value={<MutualPromotionPaidSubscriberPrice channel={channel} />} />
            ) : null}
          </dl>
          <MutualPromotionParticipantRoleBadge role={channel.role} compact />
        </div>
      ))}
    </div>
  );
}

function ChannelStat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-neutral-400">{label}</dt>
      <dd className={`truncate font-medium tabular-nums ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

function formatCount(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat().format(value);
}
