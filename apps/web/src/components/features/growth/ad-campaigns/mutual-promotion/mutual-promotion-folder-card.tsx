"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MutualPromotionFolderListItem } from "@telegram-system/shared";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { formatDateTime } from "@/lib/date-format";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion-folder-status-badge";
import { MutualPromotionPaidSubscriberPrice } from "./mutual-promotion-paid-subscriber-price";
import { MutualPromotionParticipantRoleBadge } from "./mutual-promotion-participant-role-badge";

export function MutualPromotionFolderCard({
  folder,
  onOpen,
}: {
  folder: MutualPromotionFolderListItem;
  onOpen: () => void;
}) {
  const publisherChannels = folder.channels.filter(
    (channel) => channel.role === "PUBLISHER",
  );
  const paidChannels = folder.channels.filter(
    (channel) => channel.role === "PAID",
  );

  return (
    <article className="group relative rounded-2xl border border-neutral-800 bg-neutral-950/80 transition duration-200 hover:border-neutral-700">
      <button
        type="button"
        className="block w-full rounded-t-2xl p-4 pb-0 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-600"
        onClick={onOpen}
        aria-label={`Open folder ${folder.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">
              {folder.title}
            </h3>
            <p className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-neutral-400">
              <CalendarClock size={14} className="shrink-0" />
              <span>{formatDateTime(folder.startsAt)}</span>
              <span className="text-neutral-600">→</span>
              <span>{formatDateTime(folder.endsAt)}</span>
            </p>
          </div>
          <MutualPromotionFolderStatusBadge status={folder.status} />
        </div>
      </button>

      <div className="mx-4 mt-3 grid grid-cols-3 divide-x divide-white/10 rounded-lg border border-white/5 bg-black/25 py-2 text-center">
        <Metric value={folder.postCount} label="Posts" />
        <ChannelMetric channels={publisherChannels} label="Publishers" />
        <ChannelMetric channels={paidChannels} label="Paid" />
      </div>

      <ChannelPerformance channels={folder.channels} />

      <div className="mt-3 flex justify-end border-t border-white/10 px-4 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 transition group-hover:text-sky-200"
        >
          Details <ArrowUpRight size={14} />
        </button>
      </div>
    </article>
  );
}

function ChannelPerformance({
  channels,
}: {
  channels: MutualPromotionFolderListItem["channels"];
}) {
  if (!channels.length) return null;

  return (
    <div
      className="mx-4 mt-3 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-black/20"
      aria-label="Channel performance"
    >
      {channels.map((channel) => (
        <div key={`${channel.role}:${channel.id}`} className="px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <TelegramEntityAvatar
              imageUrl={channel.photoUrl}
              alt=""
              kind="channel"
              size="xs"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
              {channel.title}
            </span>
            <MutualPromotionParticipantRoleBadge role={channel.role} compact />
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-2 pl-7 text-[10px]">
            <ChannelStat
              label="Joined"
              value={formatCount(channel.stats.joinedCount)}
              tone="text-emerald-300"
            />
            {channel.role === "PUBLISHER" ? (
              <ChannelStat
                label="Left ≈"
                value={formatCount(channel.stats.unsubscribedCount)}
                tone="text-rose-300"
              />
            ) : null}
            {channel.role === "PAID" ? (
              <ChannelStat
                label="Price"
                value={<MutualPromotionPaidSubscriberPrice channel={channel} />}
              />
            ) : null}
          </dl>
        </div>
      ))}
    </div>
  );
}

function ChannelStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-neutral-600">{label}</dt>
      <dd className={`truncate font-medium tabular-nums ${tone ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}

function formatCount(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat().format(value);
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function ChannelMetric({
  channels,
  label,
}: {
  channels: MutualPromotionFolderListItem["channels"];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const positionPopover = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 240;
      const left = Math.min(
        Math.max(12, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 12,
      );
      setPopoverStyle({ left, top: rect.bottom + 8, width });
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (channels.length === 0) {
    return <Metric value={0} label={label} />;
  }

  return (
    <div className="flex min-w-0 flex-col items-center">
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-7 items-center justify-center rounded-lg px-2 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`View ${channels.length} ${label.toLowerCase()} channels`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex -space-x-2">
          {channels.slice(0, 3).map((channel) => (
            <span
              key={channel.id}
              className="rounded-full bg-neutral-950 p-0.5 ring-1 ring-neutral-700"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                alt={channel.title}
                kind="channel"
                size="xs"
              />
            </span>
          ))}
        </span>
        {channels.length > 3 ? (
          <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-300">
            +{channels.length - 3}
          </span>
        ) : null}
      </button>
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              role="menu"
              aria-label={`${label} channels`}
              style={popoverStyle}
              className="fixed z-[200] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl"
            >
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  role="menuitem"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left"
                >
                  <TelegramEntityAvatar
                    imageUrl={channel.photoUrl}
                    alt=""
                    kind="channel"
                    size="xs"
                  />
                  <span className="min-w-0 truncate text-xs font-medium text-neutral-100">
                    {channel.title}
                  </span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
