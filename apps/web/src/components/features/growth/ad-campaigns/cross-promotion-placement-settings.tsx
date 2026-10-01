"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Eye, Radio, Users } from "lucide-react";
import type {
  TelegramAdProduct,
  TelegramPublicationSlotOccurrence,
} from "@telegram-system/shared";
import {
  telegramPublicationSchedulesApi,
  type TelegramChannel,
} from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import {
  CustomSelect,
  DateInput,
  FormField,
  TimeInput,
} from "@/components/ui/primitives";
import { CommonAdSlotOptions } from "../common-ad-slot-options";

export type CrossPromotionPlacementSettingsValue = {
  formatIds: Record<string, string>;
  dates?: Record<string, string>;
  times: Record<string, string>;
  hasIndividualOverrides?: boolean;
};

function validDateKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
    ? value
    : null;
}

export function CrossPromotionPlacementSettings({
  title,
  description,
  channelIds,
  channels,
  productsByChannelId,
  value,
  defaultDate,
  defaultTime,
  onDefaultDateChange,
  onChange,
  showAdSlots = false,
  managedPostUrls = {},
  formatErrorChannelIds = [],
}: {
  title: string;
  description: string;
  channelIds: string[];
  channels: TelegramChannel[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  value: CrossPromotionPlacementSettingsValue;
  defaultDate: string;
  defaultTime: string;
  onDefaultDateChange?: (date: string) => void;
  onChange: (value: CrossPromotionPlacementSettingsValue) => void;
  showAdSlots?: boolean;
  managedPostUrls?: Record<string, string>;
  formatErrorChannelIds?: string[];
}) {
  const selected = channelIds
    .map((id) => channels.find((channel) => channel.id === id))
    .filter((channel): channel is TelegramChannel => Boolean(channel));
  const fallbackSlotDate = validDateKey(defaultDate) ?? new Date().toISOString().slice(0, 10);
  const slotDates = channelIds
    .map((channelId) => validDateKey(value.dates?.[channelId] ?? defaultDate))
    .filter((date): date is string => Boolean(date));
  const slotRange = useMemo(() => {
    const dates = [...new Set(slotDates)].sort();
    const first = dates[0] ?? fallbackSlotDate;
    const last = dates.at(-1) ?? fallbackSlotDate;
    return {
      from: new Date(`${first}T00:00:00.000Z`).toISOString(),
      to: new Date(
        new Date(`${last}T00:00:00.000Z`).getTime() + 2 * 86_400_000,
      ).toISOString(),
    };
  }, [fallbackSlotDate, slotDates.join("|")]);
  const slotOccurrences = useQuery({
    queryKey: telegramPublicationScheduleKeys.occurrencesByChannels(
      [...channelIds].sort(),
      slotRange,
    ),
    queryFn: () =>
      telegramPublicationSchedulesApi.occurrencesByChannels(
        channelIds,
        slotRange,
      ),
    enabled: showAdSlots && channelIds.length > 0 && slotDates.length > 0,
    staleTime: 30_000,
  });
  const occurrencesByChannel: Record<
    string,
    TelegramPublicationSlotOccurrence[]
  > = slotOccurrences.data ?? {};
  const commonFormats = (productsByChannelId[channelIds[0] ?? ""] ?? []).filter(
    (product, index, products) =>
      products.findIndex((candidate) => candidate.name === product.name) ===
        index &&
      channelIds.every((channelId) =>
        (productsByChannelId[channelId] ?? []).some(
          (candidate) => candidate.name === product.name,
        ),
      ),
  );
  const selectedFormatNames = channelIds.map(
    (channelId) =>
      (productsByChannelId[channelId] ?? []).find(
        (product) => product.id === value.formatIds[channelId],
      )?.name,
  );
  const commonFormatName =
    selectedFormatNames.length > 0 &&
    selectedFormatNames.every(
      (name) => Boolean(name) && name === selectedFormatNames[0],
    )
      ? (selectedFormatNames[0] ?? "")
      : "";
  const selectedTimes = channelIds.map(
    (channelId) => value.times[channelId] ?? defaultTime,
  );
  const commonTime = selectedTimes.every((time) => time === selectedTimes[0])
    ? (selectedTimes[0] ?? defaultTime)
    : "";
  const hasLegacyIndividualOverrides =
    new Set(selectedFormatNames.filter(Boolean)).size > 1 ||
    new Set(selectedTimes).size > 1 ||
    channelIds.some(
      (channelId) =>
        Boolean(value.dates?.[channelId]) &&
        value.dates?.[channelId] !== defaultDate,
    );
  const shouldRestoreExpanded = Boolean(
    value.hasIndividualOverrides ||
      hasLegacyIndividualOverrides ||
      formatErrorChannelIds.length,
  );
  const [expanded, setExpanded] = useState(shouldRestoreExpanded);
  const previousRestoreState = useRef(shouldRestoreExpanded);

  useEffect(() => {
    if (shouldRestoreExpanded && !previousRestoreState.current) {
      // A restored draft can arrive after this controlled component mounts.
      setExpanded(true);
    }
    previousRestoreState.current = shouldRestoreExpanded;
  }, [shouldRestoreExpanded]);
  const setAllTimes = (time: string) =>
    onChange({
      ...value,
      times: Object.fromEntries(channelIds.map((id) => [id, time])),
    });
  const setAllDates = (date: string) => {
    onDefaultDateChange?.(date);
    onChange({
      ...value,
      dates: Object.fromEntries(channelIds.map((id) => [id, date])),
    });
  };
  const setAllFormats = (formatName: string) =>
    onChange({
      ...value,
      formatIds: {
        ...value.formatIds,
        ...Object.fromEntries(
          channelIds.flatMap((channelId) => {
            const product = (productsByChannelId[channelId] ?? []).find(
              (candidate) => candidate.name === formatName,
            );
            return product ? [[channelId, product.id]] : [];
          }),
        ),
      },
    });

  return (
    <section className="space-y-3 border-y border-neutral-800 py-3 sm:rounded-xl sm:border sm:bg-neutral-950/55 sm:p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Radio size={15} className="text-blue-300" /> {title}
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            {description}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`mt-0.5 shrink-0 text-neutral-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {channelIds.length ? (
        <>
          <div
            data-testid="placement-defaults"
            className={`grid items-start gap-3 ${
              onDefaultDateChange
                ? "grid-cols-1 lg:grid-cols-[minmax(200px,1.05fr)_minmax(160px,.9fr)_minmax(220px,1fr)]"
                : "sm:grid-cols-[minmax(170px,220px)_112px] sm:justify-end"
            }`}
          >
            {onDefaultDateChange ? (
              <FormField label="Publication date" required>
                <DateInput
                  value={defaultDate}
                  onChange={(event) => setAllDates(event.target.value)}
                />
              </FormField>
            ) : null}
            <div className="min-w-0 space-y-2">
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block text-neutral-300">Time for all</span>
                <TimeInput
                  value={commonTime}
                  onChange={(event) => setAllTimes(event.target.value)}
                  className={onDefaultDateChange ? "h-9 w-full" : "h-9 w-28"}
                />
              </label>
              {showAdSlots ? (
                <CommonAdSlotOptions
                  channelIds={channelIds}
                  date={defaultDate}
                  selectedTime={commonTime}
                  onSelect={setAllTimes}
                  occurrencesByChannel={occurrencesByChannel}
                  loading={slotOccurrences.isPending}
                />
              ) : null}
            </div>
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block text-neutral-300">Format for all</span>
              <span className="block [&>div>button]:h-9 [&>div>button]:min-h-0">
                <CustomSelect
                  value={commonFormatName}
                  onChange={setAllFormats}
                  searchable={false}
                  placeholder={
                    commonFormats.length
                      ? "Mixed / select format"
                      : "No common formats"
                  }
                  disabled={!commonFormats.length}
                  options={commonFormats.map((product) => ({
                    value: product.name,
                    label: product.name,
                  }))}
                />
              </span>
            </label>
          </div>
        </>
      ) : null}
      {expanded ? (
        <div className="grid gap-2">
          {selected.map((channel) => {
            const products = productsByChannelId[channel.id] ?? [];
            const managedPostUrl = managedPostUrls[channel.id];
            const selectedProduct = products.find(
              (product) => product.id === value.formatIds[channel.id],
            );
            const hasFormatError = formatErrorChannelIds.includes(channel.id);
            return (
              <div
                key={channel.id}
                className="grid items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(170px,.7fr)_150px_120px]"
              >
                <div className="flex min-w-0 items-center gap-2 self-center">
                  {channel.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={channel.photoUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs">
                      {channel.title.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {channel.title}
                    </p>
                    <p className="flex gap-3 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} />
                        {channel.currentSubscribersCount?.toLocaleString() ??
                          "—"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sky-300">
                        <Eye size={12} />
                        {selectedProduct?.estimatedViews != null
                          ? `≈ ${selectedProduct.estimatedViews.toLocaleString()} views`
                          : "No estimate"}
                      </span>
                    </p>
                    {managedPostUrl ? (
                      <a
                        href={managedPostUrl}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <ExternalLink size={12} /> Open publication
                      </a>
                    ) : null}
                  </div>
                </div>
                <FormField
                  label="Format"
                  required
                  error={
                    hasFormatError
                      ? "Choose a format for this channel."
                      : undefined
                  }
                >
                  <CustomSelect
                    value={value.formatIds[channel.id] ?? ""}
                    onChange={(formatId) =>
                      onChange({
                        ...value,
                        hasIndividualOverrides: true,
                        formatIds: {
                          ...value.formatIds,
                          [channel.id]: formatId,
                        },
                      })
                    }
                    placeholder={
                      products.length ? "Select format" : "No formats"
                    }
                    disabled={!products.length}
                    className={
                      hasFormatError
                        ? "rounded-lg ring-1 ring-rose-500"
                        : undefined
                    }
                    options={products.map((product) => ({
                      value: product.id,
                      label: product.name,
                      meta:
                        product.estimatedViews == null
                          ? undefined
                          : `≈${product.estimatedViews.toLocaleString()}`,
                    }))}
                  />
                </FormField>
                <FormField label="Publication date" required>
                  <DateInput
                    value={value.dates?.[channel.id] ?? defaultDate}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        hasIndividualOverrides: true,
                        dates: {
                          ...value.dates,
                          [channel.id]: event.target.value,
                        },
                      })
                    }
                  />
                </FormField>
                <FormField label="Publication time" required>
                  <TimeInput
                    value={value.times[channel.id] ?? defaultTime}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        hasIndividualOverrides: true,
                        times: {
                          ...value.times,
                          [channel.id]: event.target.value,
                        },
                      })
                    }
                  />
                </FormField>
                {showAdSlots ? (
                  <div className="col-span-full">
                    <CommonAdSlotOptions
                      channelIds={[channel.id]}
                      date={value.dates?.[channel.id] ?? defaultDate}
                      selectedTime={value.times[channel.id] ?? defaultTime}
                      onSelect={(time) =>
                        onChange({
                          ...value,
                          hasIndividualOverrides: true,
                          times: { ...value.times, [channel.id]: time },
                        })
                      }
                      occurrencesByChannel={occurrencesByChannel}
                      loading={slotOccurrences.isPending}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
