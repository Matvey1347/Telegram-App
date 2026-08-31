"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdSaleListItem } from "@telegram-system/shared";
import { Hourglass, Timer, Trash2 } from "lucide-react";
import type { TelegramChannel } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { placementFormatLabel, placementTimer } from "./ad-placement-lifecycle";

type Placement = TelegramAdSaleListItem["placements"][number];

function groupedByWindow(placements: Placement[]) {
  return [
    ...placements
      .reduce((groups, placement) => {
        const key = String(new Date(placement.scheduledAt).getTime());
        const group = groups.get(key) ?? [];
        group.push(placement);
        groups.set(key, group);
        return groups;
      }, new Map<string, Placement[]>())
      .values(),
  ];
}

function lifecycleLabel(placements: Placement[]) {
  const published = placements
    .map((item) => item.publishedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .sort((left, right) => left - right);
  if (published.length === placements.length) {
    const first = formatDateTime(new Date(published[0]).toISOString());
    const last = formatDateTime(new Date(published.at(-1)!).toISOString());
    return first === last
      ? `Published ${first}`
      : `Published ${first} → ${last}`;
  }
  const dates = placements
    .map((item) => new Date(item.scheduledAt).getTime())
    .sort((left, right) => left - right);
  const first = formatDateTime(new Date(dates[0]).toISOString());
  const last = formatDateTime(new Date(dates.at(-1)!).toISOString());
  const scheduled =
    first === last ? `Scheduled ${first}` : `Scheduled ${first} → ${last}`;
  return published.length
    ? `${published.length}/${placements.length} published · ${scheduled}`
    : scheduled;
}

function formatsLabel(placements: Placement[]) {
  return [
    ...new Set(placements.map(placementFormatLabel).filter(Boolean)),
  ].join(", ");
}

function ChannelPreview({
  placements,
  channelsById,
}: {
  placements: Placement[];
  channelsById: Map<string, TelegramChannel>;
}) {
  const channels = placements.map((placement) => {
    const channel = channelsById.get(placement.telegramChannelId);
    return {
      id: placement.telegramChannelId,
      title: channel?.title ?? "Telegram channel",
      photoUrl: channel?.photoUrl ?? null,
    };
  });
  if (channels.length === 1)
    return (
      <div className="flex min-w-0 items-center gap-2">
        <TelegramEntityAvatar
          imageUrl={channels[0].photoUrl}
          kind="channel"
          alt={channels[0].title}
          size="xs"
        />
        <span className="truncate text-xs font-medium text-neutral-300">
          {channels[0].title}
        </span>
      </div>
    );
  return (
    <details
      className="group relative w-fit"
      onClick={(event) => event.stopPropagation()}
    >
      <summary
        aria-label={`Show ${channels.length} placement channels`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex -space-x-2">
          {channels.slice(0, 3).map((channel) => (
            <span
              key={channel.id}
              className="rounded-full ring-2 ring-[#111111]"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                kind="channel"
                alt={channel.title}
                size="xs"
              />
            </span>
          ))}
        </span>
        <span className="text-xs font-medium text-neutral-300">
          {channels.length} channels
        </span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-2 min-w-56 space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
        {channels.map((channel) => (
          <div key={channel.id} className="flex items-center gap-2 px-1 py-1">
            <TelegramEntityAvatar
              imageUrl={channel.photoUrl}
              kind="channel"
              alt={channel.title}
              size="xs"
            />
            <span className="whitespace-nowrap text-xs text-neutral-200">
              {channel.title}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function Status({
  placement,
  now,
  observedPublishedAt,
}: {
  placement: Placement;
  now: number;
  observedPublishedAt?: number;
}) {
  const justPublished =
    observedPublishedAt != null && now - observedPublishedAt < 3_000;
  if (justPublished)
    return (
      <p className="mt-0.5 text-xs font-medium text-emerald-300">
        Published ✅
      </p>
    );
  const timer = placementTimer(placement, now);
  if (!timer) return null;
  const pending = timer.label === "Publication pending";
  return (
    <p
      className={`mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs tabular-nums ${pending || timer.phase === "deletion" ? "text-amber-300" : "text-neutral-500"}`}
    >
      {timer.phase === "complete" ? (
        <Trash2 size={13} aria-hidden="true" />
      ) : timer.phase === "deletion" ? (
        <Timer size={13} aria-hidden="true" />
      ) : (
        <Hourglass size={13} aria-hidden="true" />
      )}
      {pending ? (
        <span aria-label="Publication pending">
          Publication pending{".".repeat((Math.floor(now / 1_000) % 3) + 1)}
        </span>
      ) : (
        timer.label
      )}
    </p>
  );
}

export function AdSalePlacementLifecyclePreview({
  placements,
  channelsById,
  now,
}: {
  placements: Placement[];
  channelsById: Map<string, TelegramChannel>;
  now: number;
}) {
  const previousPublishedRef = useRef(
    new Map(placements.map((item) => [item.id, Boolean(item.publishedAt)])),
  );
  const [observedPublished, setObservedPublished] = useState<
    Record<string, number>
  >({});
  const [transitionTick, setTransitionTick] = useState(0);
  const publicationSignature = placements
    .map((item) => `${item.id}:${Boolean(item.publishedAt)}`)
    .join("|");
  useEffect(() => {
    const newlyObserved: Record<string, number> = {};
    for (const placement of placements) {
      const published = Boolean(placement.publishedAt);
      if (
        published &&
        previousPublishedRef.current.get(placement.id) === false
      ) {
        newlyObserved[placement.id] = Date.now();
      }
      previousPublishedRef.current.set(placement.id, published);
    }
    if (!Object.keys(newlyObserved).length) return;
    const startTimeout = window.setTimeout(() => {
      setObservedPublished((current) => ({ ...current, ...newlyObserved }));
      setTransitionTick(Date.now());
    }, 0);
    const endTimeout = window.setTimeout(
      () => setTransitionTick(Date.now()),
      3_000,
    );
    return () => {
      window.clearTimeout(startTimeout);
      window.clearTimeout(endTimeout);
    };
  }, [placements, publicationSignature]);
  const effectiveNow = Math.max(now, transitionTick);
  const sameChannel =
    placements.length > 1 &&
    placements.every(
      (item) => item.telegramChannelId === placements[0].telegramChannelId,
    );
  const groups = sameChannel ? [placements] : groupedByWindow(placements);
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const formats = formatsLabel(group);
        const statusPlacement =
          group.find((item) => !item.publishedAt) ?? group[0];
        const groupObservedPublishedAt = group.every((item) => item.publishedAt)
          ? Math.max(...group.map((item) => observedPublished[item.id] ?? 0)) ||
            undefined
          : undefined;
        return (
          <div key={group.map(({ id }) => id).join("-")} className="min-w-0">
            <ChannelPreview
              placements={sameChannel ? [group[0]] : group}
              channelsById={channelsById}
            />
            <p className="mt-0.5 max-w-72 text-xs text-neutral-500">
              {lifecycleLabel(group)}
              {formats ? ` · ${formats}` : ""}
            </p>
            {sameChannel ? (
              <p className="mt-0.5 text-xs text-neutral-500">
                {group.length} placements
              </p>
            ) : null}
            <Status
              placement={statusPlacement}
              now={effectiveNow}
              observedPublishedAt={groupObservedPublishedAt}
            />
          </div>
        );
      })}
    </div>
  );
}
