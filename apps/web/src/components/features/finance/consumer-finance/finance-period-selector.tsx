"use client";

import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  History,
} from "lucide-react";
import type {
  ConsumerFinanceAnalyticsPeriod,
  ConsumerFinanceAnalyticsQuery,
} from "@telegram-system/shared";
import { Button, Input } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";

const PERIODS: Array<{
  value: ConsumerFinanceAnalyticsPeriod;
  icon: typeof CalendarDays;
  label: "currentMonth" | "previousMonth" | "lastThreeMonths" | "customPeriod";
}> = [
  { value: "CURRENT_MONTH", icon: CalendarDays, label: "currentMonth" },
  { value: "PREVIOUS_MONTH", icon: ChevronLeft, label: "previousMonth" },
  { value: "LAST_3_MONTHS", icon: History, label: "lastThreeMonths" },
  { value: "CUSTOM", icon: CalendarRange, label: "customPeriod" },
];

export function FinancePeriodSelector({
  value,
  locale,
  onChange,
}: {
  value: ConsumerFinanceAnalyticsQuery;
  locale: FinanceLocale;
  onChange: (value: ConsumerFinanceAnalyticsQuery) => void;
}) {
  const t = financeAnalyticsCopy(locale);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-label={t.analyticsPeriod}>
        {PERIODS.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              className="!px-3 !py-1.5 text-xs"
              variant={value.period === item.value ? "primary" : "outline"}
              onClick={() =>
                onChange(
                  item.value === "CUSTOM"
                    ? {
                        period: "CUSTOM",
                        ...financePeriodDateRange({ period: "CURRENT_MONTH" }),
                      }
                    : { period: item.value },
                )
              }
            >
              <Icon size={16} aria-hidden="true" />
              {t[item.label]}
            </Button>
          );
        })}
      </div>
      {value.period === "CUSTOM" ? (
        <div className="grid grid-cols-1 gap-2 sm:max-w-xl sm:grid-cols-2">
          <Input
            aria-label={t.analyticsStart}
            type="date"
            value={value.from ?? ""}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
          />
          <Input
            aria-label={t.analyticsEnd}
            type="date"
            value={value.to ?? ""}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function financePeriodDateRange(
  query: ConsumerFinanceAnalyticsQuery,
  now = new Date(),
) {
  if (query.period === "CUSTOM") return { from: query.from, to: query.to };
  const year = now.getFullYear();
  const month = now.getMonth();
  const calendarDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const date = (offset: number) =>
    calendarDate(new Date(year, month + offset, 1));
  const endDate = (offset: number) =>
    calendarDate(new Date(year, month + offset, 0));
  if (query.period === "PREVIOUS_MONTH")
    return { from: date(-1), to: endDate(0) };
  if (query.period === "LAST_3_MONTHS")
    return { from: date(-2), to: endDate(1) };
  return { from: date(0), to: endDate(1) };
}
