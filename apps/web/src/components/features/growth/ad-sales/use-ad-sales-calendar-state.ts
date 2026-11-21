"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  dateKey,
  listDaysInRange,
  monthGridDays,
  monthGridDaysForRange,
  rangeForCalendarMode,
  rangeForVisibleCalendarDays,
  sameStringArray,
} from "@/components/features/growth/ad-sales/ad-sales-calendar-range";
import {
  readAdSalesCalendarRangeMode,
  writeAdSalesCalendarRangeMode,
  type TelegramAdSalesCalendarRangeMode,
} from "@/lib/features/growth/telegram-ad-sales";
import { resolveAdSalesPreferenceSelection } from "@/lib/features/growth/ad-sales-preferences-hydration";
import type { Dispatch, SetStateAction } from "react";

export function useAdSalesCalendarRange() {
  const [calendarRangeMode, setCalendarRangeMode] =
    useState<TelegramAdSalesCalendarRangeMode>("month");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarRangeSelection, setCalendarRangeSelection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  useLayoutEffect(() => {
    const storedView = readAdSalesCalendarRangeMode(window.localStorage);
    if (!storedView) return;
    // Apply the stored visual mode before the browser paints the calendar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarRangeMode(storedView);
  }, []);
  const { from, to } = useMemo(() => {
    if (calendarRangeSelection?.from) {
      return {
        from: new Date(`${calendarRangeSelection.from}T00:00:00`),
        to: new Date(
          `${calendarRangeSelection.to || calendarRangeSelection.from}T23:59:59.999`,
        ),
      };
    }
    return rangeForCalendarMode(calendarRangeMode, calendarCursor);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection]);

  const calendarDays = useMemo(() => {
    if (calendarRangeMode === "month" && !calendarRangeSelection?.from) {
      return monthGridDays(calendarCursor);
    }
    if (calendarRangeMode === "threeMonths" && !calendarRangeSelection?.from) {
      return monthGridDaysForRange(from, to);
    }
    return listDaysInRange(from, to);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection, from, to]);
  const calendarAvailabilityRange = useMemo(
    () => rangeForVisibleCalendarDays(calendarDays, { from, to }),
    [calendarDays, from, to],
  );
  const handleCalendarRangeChange = (range: { from: string; to: string }) => {
    setCalendarRangeSelection(range.from || range.to ? range : null);
    if (range.from) {
      setCalendarCursor(new Date(`${range.from}T12:00:00`));
    }
  };

  const shiftCalendarRange = (direction: -1 | 1) => {
    if (calendarRangeSelection?.from) {
      const currentFrom = new Date(`${calendarRangeSelection.from}T00:00:00`);
      const currentTo = new Date(
        `${calendarRangeSelection.to || calendarRangeSelection.from}T00:00:00`,
      );
      const span = Math.max(
        1,
        Math.round(
          (currentTo.getTime() - currentFrom.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1,
      );
      const nextFrom = addDays(currentFrom, span * direction);
      const nextTo = addDays(currentTo, span * direction);
      setCalendarRangeSelection({
        from: dateKey(nextFrom),
        to: dateKey(nextTo),
      });
      setCalendarCursor(new Date(nextFrom));
      return;
    }
    setCalendarCursor((current) =>
      calendarRangeMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : calendarRangeMode === "threeMonths"
          ? new Date(
              current.getFullYear(),
              current.getMonth() + direction * 3,
              1,
            )
          : addDays(current, direction * 7),
    );
  };

  const goToToday = () => {
    setCalendarRangeSelection(null);
    setCalendarCursor(new Date());
  };
  return {
    calendarRangeMode,
    setCalendarRangeMode,
    calendarCursor,
    calendarRangeSelection,
    from,
    to,
    calendarDays,
    calendarAvailabilityRange,
    handleCalendarRangeChange,
    shiftCalendarRange,
    goToToday,
  };
}

type CalendarRange = ReturnType<typeof useAdSalesCalendarRange>;
type SelectionParameters = Parameters<
  typeof resolveAdSalesPreferenceSelection
>[0];

export function useAdSalesCalendarPreferences({
  preferences,
  channelsReady,
  networksReady,
  saleableChannelIds: saleableChannelIdsList,
  networks: saleableNetworks,
  requestedChannelId,
  savePreferences,
  selectedChannelIds,
  selectedNetworkId,
  setSelectedChannelIds,
  setSelectedNetworkId,
  calendarRangeMode,
  setCalendarRangeMode,
}: SelectionParameters & {
  savePreferences: (payload: Record<string, unknown>) => void;
  selectedChannelIds: string[];
  selectedNetworkId: string;
  setSelectedChannelIds: Dispatch<SetStateAction<string[]>>;
  setSelectedNetworkId: Dispatch<SetStateAction<string>>;
  calendarRangeMode: CalendarRange["calendarRangeMode"];
  setCalendarRangeMode: CalendarRange["setCalendarRangeMode"];
}) {
  const appliedPreferencesSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const resolvedSelection = resolveAdSalesPreferenceSelection({
      preferences,
      channelsReady: channelsReady,
      networksReady: networksReady,
      saleableChannelIds: saleableChannelIdsList,
      networks: saleableNetworks,
      requestedChannelId,
    });
    if (!preferences || !resolvedSelection) return;
    const nextNetworkId = resolvedSelection.selectedNetworkId;
    const nextIds = resolvedSelection.selectedChannelIds;
    const storedRangeMode = readAdSalesCalendarRangeMode(window.localStorage);
    const normalizedView =
      storedRangeMode ??
      (preferences.initialized && preferences.calendarView === "week"
        ? "week"
        : "month");
    const nextCalendarRangeMode = normalizedView;
    writeAdSalesCalendarRangeMode(window.localStorage, nextCalendarRangeMode);
    const nextPreferencesSignature = JSON.stringify({
      nextIds,
      nextNetworkId,
      nextCalendarRangeMode,
      saleableChannelIdsList,
    });

    if (appliedPreferencesSignatureRef.current === nextPreferencesSignature) {
      return;
    }
    appliedPreferencesSignatureRef.current = nextPreferencesSignature;

    setSelectedChannelIds((current) =>
      sameStringArray(current, nextIds) ? current : nextIds,
    );
    setSelectedNetworkId((current) =>
      current === nextNetworkId ? current : nextNetworkId,
    );
    setCalendarRangeMode((current) =>
      current === nextCalendarRangeMode ? current : nextCalendarRangeMode,
    );

    if (!preferences.initialized && nextIds.length) {
      savePreferences({
        selectedChannelIds: nextIds,
        selectedNetworkId: null,
        calendarView:
          nextCalendarRangeMode === "threeMonths"
            ? "month"
            : nextCalendarRangeMode,
        initialized: true,
      });
      return;
    }

    if (
      preferences.initialized &&
      (!sameStringArray(nextIds, preferences.selectedChannelIds) ||
        nextNetworkId !== (preferences.selectedNetworkId ?? ""))
    ) {
      savePreferences({
        selectedChannelIds: nextIds,
        selectedNetworkId: nextNetworkId || null,
        calendarView:
          nextCalendarRangeMode === "threeMonths"
            ? "month"
            : nextCalendarRangeMode,
        initialized: true,
      });
    }
  }, [
    channelsReady,
    networksReady,
    preferences,
    requestedChannelId,
    savePreferences,
    saleableChannelIdsList,
    saleableNetworks,
    setCalendarRangeMode,
    setSelectedChannelIds,
    setSelectedNetworkId,
  ]);

  const persistCalendarPreferences = (
    payload: Partial<{
      selectedChannelIds: string[];
      selectedNetworkId: string | null;
      calendarView: "week" | "month";
    }>,
  ) => {
    savePreferences({
      selectedChannelIds,
      selectedNetworkId: selectedNetworkId || null,
      calendarView:
        payload.calendarView ??
        (calendarRangeMode === "threeMonths" ? "month" : calendarRangeMode),
      ...payload,
      initialized: true,
    });
  };

  const handleCalendarRangeModeChange = (
    view: TelegramAdSalesCalendarRangeMode,
  ) => {
    writeAdSalesCalendarRangeMode(window.localStorage, view);
    setCalendarRangeMode(view);
    if (view !== "threeMonths") {
      persistCalendarPreferences({ calendarView: view });
    }
  };

  return handleCalendarRangeModeChange;
}
