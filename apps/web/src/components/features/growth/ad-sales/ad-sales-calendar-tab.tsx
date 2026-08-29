"use client";

import { formatDateWithWeekday } from "@/lib/date-format";

import { useMemo } from "react";
import type { TelegramAdAvailabilitySlot } from "@telegram-system/shared";
import { CalendarSlotCard } from "@/components/features/growth/ad-sales/calendar-slot-card";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { Skeleton } from "@/components/ui/primitives";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import {
  buildAdCalendarSlots,
  channelLocalDateKey,
  toNumber,
} from "@/lib/features/growth/telegram-ad-sales";
import { formatMoney } from "@/lib/features/finance/money";

const adSalesPanelClass =
  "rounded-[22px] border border-neutral-800 bg-[#171717]";
function dateKey(value: Date) {
  return channelLocalDateKey(value);
}

export function formatCalendarTransactionMoney(
  amount: number,
  currency: string,
  settings?: CurrencySettings,
) {
  return formatMoney(amount, currency, settings?.currencyDisplayMode ?? "code");
}

export function groupCalendarSoldSlotsBySale<
  T extends {
    slot: { existingPlacement?: { saleId: string } | null };
  },
>(entries: T[]) {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const saleId = entry.slot.existingPlacement?.saleId;
    if (!saleId) continue;
    grouped.set(saleId, [...(grouped.get(saleId) ?? []), entry]);
  }
  return Array.from(grouped, ([saleId, saleEntries]) => ({
    saleId,
    entries: saleEntries,
  }));
}

export function CalendarTab(props: {
  loadingChannelIds: string[];
  failedChannelIds: string[];
  calendarRangeMode: "week" | "month" | "threeMonths";
  calendarCursor: Date;
  calendarFrom: Date;
  calendarTo: Date;
  calendarDays: Date[];
  channels: TelegramChannel[];
  selectedChannelIds: string[];
  filteredSlots: ReturnType<typeof buildAdCalendarSlots>;
  daySummaries: Array<{
    channelId: string;
    date: string;
    timezone: string;
    organicPostsCountForDay: number;
    adsCountForDay: number;
  }>;
  settings?: CurrencySettings;
  workspaceTimezone: string;
  onCreateFromSlot: (slot: TelegramAdAvailabilitySlot) => void;
  onOpenSale: (saleId: string) => void;
}) {
  const { filteredSlots } = props;
  const loadingChannelIds = useMemo(
    () => new Set(props.loadingChannelIds),
    [props.loadingChannelIds],
  );
  const failedChannelIds = useMemo(
    () => new Set(props.failedChannelIds),
    [props.failedChannelIds],
  );
  const slotsByChannelDay = useMemo(() => {
    const grouped = new Map<string, typeof filteredSlots>();
    for (const slot of filteredSlots) {
      const key = `${slot.channelId}:${slot.date}`;
      const current = grouped.get(key) ?? [];
      current.push(slot);
      grouped.set(key, current);
    }
    return grouped;
  }, [filteredSlots]);

  const daySummariesByChannelDay = useMemo(() => {
    const grouped = new Map<
      string,
      {
        channelId: string;
        date: string;
        timezone: string;
        organicPostsCountForDay: number;
        adsCountForDay: number;
      }
    >();
    for (const summary of props.daySummaries) {
      grouped.set(`${summary.channelId}:${summary.date}`, summary);
    }
    return grouped;
  }, [props.daySummaries]);

  const visibleChannels = useMemo(
    () =>
      props.channels.filter((channel) =>
        props.selectedChannelIds.length
          ? props.selectedChannelIds.includes(channel.id)
          : true,
      ),
    [props.channels, props.selectedChannelIds],
  );
  const todayKey = channelLocalDateKey(new Date());
  const renderSlot = (
    slot: ReturnType<typeof buildAdCalendarSlots>[number],
  ) => {
    const placement = slot.existingPlacement;
    return (
      <CalendarSlotCard
        key={slot.id}
        slot={slot}
        advertiserName={placement?.advertiserName}
        saleTitle={placement?.title}
        paymentStatus={placement?.paymentStatus || "UNPAID"}
        agreedPrice={placement?.agreedPrice}
        agreedCurrency={placement?.currency}
        onClick={
          slot.existingPlacement?.saleId
            ? () => props.onOpenSale(slot.existingPlacement!.saleId)
            : slot.state === "AVAILABLE" ||
                (slot.state === "PAST" && !slot.existingPlacement)
              ? () => props.onCreateFromSlot(slot)
              : undefined
        }
      />
    );
  };
  const placementDetailsForSlot = (
    slot: ReturnType<typeof buildAdCalendarSlots>[number],
  ) => {
    const placement = slot.existingPlacement;
    return {
      placement,
      price: toNumber(placement?.agreedPrice),
      currency: placement?.currency || slot.currency,
    };
  };
  const summarizeRevenue = (slots: ReturnType<typeof buildAdCalendarSlots>) => {
    const totals = new Map<string, number>();
    for (const slot of slots) {
      const details = placementDetailsForSlot(slot);
      if (!details.placement) continue;
      totals.set(
        details.currency,
        (totals.get(details.currency) ?? 0) + details.price,
      );
    }
    return Array.from(totals.entries()).map(([currency, amount]) => ({
      currency,
      amount,
      label: formatCalendarTransactionMoney(amount, currency, props.settings),
    }));
  };
  const createManualSlot = (
    channel: TelegramChannel,
    day: Date,
  ): TelegramAdAvailabilitySlot => {
    const date = dateKey(day);
    return {
      channelId: channel.id,
      date,
      inventoryOpportunityKey: null,
      scheduledAt: `${date}T12:00:00.000Z`,
      timezone: props.workspaceTimezone,
      source: "manual",
      state: "AVAILABLE",
      blockingReason: null,
      nextOrganicPostAt: null,
      productId: null,
      expectedViews: channel.ownViewsPerPost ?? 0,
      recommendedPrice: "0",
      minimumPrice: "0",
      currency: props.settings?.primaryCurrency ?? "USD",
      existingPlacement: null,
      organicPostsCountForDay: 0,
      adsCountForDay: 0,
    };
  };

  return (
    <div className="space-y-5">
      {props.calendarRangeMode !== "week" ? (
        <div className={adSalesPanelClass}>
          <div className="overflow-hidden rounded-xl border border-slate-800/80">
            <div className="grid grid-cols-7 border-b border-slate-800/80 bg-[#09111e]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (label) => (
                  <div
                    key={label}
                    className="border-r border-slate-800/80 px-3 py-2 text-center text-xs font-medium text-neutral-400 last:border-r-0"
                  >
                    {label}
                  </div>
                ),
              )}
            </div>
            <div className="grid grid-cols-7">
              {props.calendarDays.map((day) => {
                const dayDateKey = dateKey(day);
                const outsideMonth =
                  day < props.calendarFrom || day > props.calendarTo;
                const daySlots = visibleChannels.flatMap((channel) =>
                  (
                    slotsByChannelDay.get(`${channel.id}:${dayDateKey}`) ?? []
                  ).map((slot) => ({
                    channel,
                    slot,
                  })),
                );
                const soldSlots = daySlots.filter(({ slot }) =>
                  Boolean(slot.existingPlacement),
                );
                const soldDeals = groupCalendarSoldSlotsBySale(soldSlots);
                const addSlotChannel = visibleChannels[0] ?? null;
                const revenue = summarizeRevenue(
                  soldSlots.map(({ slot }) => slot),
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={`group/day relative min-h-[72px] border-b border-r border-slate-900/70 p-1.5 ${outsideMonth ? "bg-black/20 opacity-45" : "bg-[#111111]"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="text-sm font-semibold text-white">
                            {day.getDate()}
                          </span>
                          {dayDateKey === todayKey ? (
                            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                              Today
                            </span>
                          ) : null}
                        </div>
                        {revenue.length ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] font-semibold leading-tight text-emerald-300">
                            {revenue.map((item) => (
                              <span key={item.currency}>{item.label}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {addSlotChannel ? (
                        <button
                          type="button"
                          onClick={() =>
                            props.onCreateFromSlot(
                              createManualSlot(addSlotChannel, day),
                            )
                          }
                          className="shrink-0 rounded-md border border-emerald-700/70 bg-emerald-950/80 px-2 py-1 text-[10px] font-semibold text-emerald-100 opacity-0 shadow-sm transition hover:border-emerald-500 focus-visible:opacity-100 group-hover/day:opacity-100"
                        >
                          Add slot
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {soldDeals.slice(0, 3).map((deal) => {
                        const firstEntry = deal.entries[0];
                        const details = placementDetailsForSlot(
                          firstEntry.slot,
                        );
                        const dealRevenue = summarizeRevenue(
                          deal.entries.map(({ slot }) => slot),
                        );
                        const dealChannels = Array.from(
                          new Map(
                            deal.entries.map(({ channel }) => [
                              channel.id,
                              channel,
                            ]),
                          ).values(),
                        );
                        const dealLabel =
                          details.placement?.advertiserName ||
                          details.placement?.title ||
                          "Direct sale";
                        return (
                          <button
                            key={deal.saleId}
                            type="button"
                            onClick={() => props.onOpenSale(deal.saleId)}
                            title={`${dealLabel} · ${deal.entries.length} placement${deal.entries.length === 1 ? "" : "s"} · ${dealRevenue.map((item) => item.label).join(" · ")}`}
                            className="flex w-full items-center gap-1.5 rounded-md border border-sky-800/70 bg-sky-950/20 px-1.5 py-1 text-left text-[10px] font-medium text-sky-100 transition hover:border-sky-500"
                          >
                            <span className="flex shrink-0 -space-x-1">
                              {dealChannels.slice(0, 2).map((channel) => (
                                <TelegramEntityAvatar
                                  key={channel.id}
                                  imageUrl={channel.photoUrl}
                                  kind="channel"
                                  alt={channel.title}
                                  size="xs"
                                />
                              ))}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {dealLabel}
                              {deal.entries.length > 1
                                ? ` · ${deal.entries.length}`
                                : ""}
                            </span>
                            <span className="ml-auto shrink-0 text-[9px] opacity-80">
                              {dealRevenue
                                .map((item) => item.label)
                                .join(" · ")}
                            </span>
                          </button>
                        );
                      })}
                      {soldDeals.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => props.onOpenSale(soldDeals[3].saleId)}
                          className="w-full rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-left text-[10px] font-medium text-neutral-300 transition hover:border-neutral-600"
                        >
                          +{soldDeals.length - 3} more deal
                          {soldDeals.length - 3 === 1 ? "" : "s"}
                        </button>
                      ) : null}
                      {props.loadingChannelIds.length ? (
                        <Skeleton className="h-6 w-full" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {props.calendarRangeMode === "week" ? (
        <div className={adSalesPanelClass}>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div
                className="sticky top-0 z-10 border-b border-slate-800/80 bg-[#09111e]/95 backdrop-blur"
                style={{
                  display: "grid",
                  gridTemplateColumns: `180px repeat(${props.calendarDays.length}, minmax(165px, 165px))`,
                }}
              >
                <div className="border-r border-slate-800/80 px-4 py-3 text-sm font-semibold text-white">
                  Channels
                </div>
                {props.calendarDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="border-r border-slate-800/80 px-3 py-2.5 text-sm"
                  >
                    <p className="font-semibold text-white">
                      {formatDateWithWeekday(day)}
                    </p>
                  </div>
                ))}
              </div>
              {visibleChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="border-b border-slate-900/60 last:border-b-0"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `180px repeat(${props.calendarDays.length}, minmax(165px, 165px))`,
                  }}
                >
                  <div className="sticky left-0 z-[1] border-r border-slate-800/80 bg-[#09111e] px-3 py-3">
                    <div className="flex items-center gap-2">
                      <TelegramEntityAvatar
                        imageUrl={channel.photoUrl}
                        kind="channel"
                        alt={channel.title}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {channel.title}
                        </p>
                        {channel.username ? (
                          <p className="truncate text-xs text-neutral-500">
                            {channel.username}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {props.calendarDays.map((day) => {
                    const dayKey = `${channel.id}:${dateKey(day)}`;
                    const slots = slotsByChannelDay.get(dayKey) ?? [];
                    const soldSlots = slots.filter((slot) =>
                      Boolean(slot.existingPlacement),
                    );
                    const revenue = summarizeRevenue(soldSlots);
                    const summary = daySummariesByChannelDay.get(dayKey);
                    const organicCount = summary?.organicPostsCountForDay ?? 0;
                    const adSlotsCount =
                      summary?.adsCountForDay ?? soldSlots.length;
                    return (
                      <div
                        key={dayKey}
                        className="group/day min-h-20 border-r border-slate-900/60 p-1.5"
                      >
                        {loadingChannelIds.has(channel.id) ? (
                          <>
                            <Skeleton className="mb-2 h-3 w-24" />
                            <Skeleton className="h-10 w-full" />
                          </>
                        ) : failedChannelIds.has(channel.id) ? (
                          <p className="text-xs text-rose-300">
                            Could not load slots.
                          </p>
                        ) : (
                          <>
                            <div className="mb-1.5 flex items-start justify-between gap-2">
                              <div className="min-w-0 text-[10px] uppercase tracking-wide text-neutral-500">
                                <p>
                                  {organicCount} organic · {adSlotsCount} slots
                                </p>
                                {revenue.length ? (
                                  <div className="mt-0.5 space-y-0.5 font-semibold normal-case tracking-normal text-emerald-300">
                                    {revenue.map((item) => (
                                      <p key={item.currency}>{item.label}</p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  props.onCreateFromSlot(
                                    createManualSlot(channel, day),
                                  )
                                }
                                className="shrink-0 rounded-md border border-emerald-700/70 bg-emerald-950/80 px-2 py-1 text-[10px] font-semibold text-emerald-100 opacity-0 transition hover:border-emerald-500 focus-visible:opacity-100 group-hover/day:opacity-100"
                              >
                                Add slot
                              </button>
                            </div>
                            <div className="space-y-1.5">
                              {soldSlots.slice(0, 2).map(renderSlot)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
