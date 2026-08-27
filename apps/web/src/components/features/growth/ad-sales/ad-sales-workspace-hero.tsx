"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Users,
} from "lucide-react";
import {
  channelLocalDateKey,
  type TelegramAdSalesCalendarRangeMode,
  type TelegramAdSalesTab,
} from "@/lib/features/growth/telegram-ad-sales";
import { DateRangeInput } from "@/components/ui/primitives";

const tabs = [
  { id: "calendar", label: "Slots", icon: CalendarRange },
  { id: "sales", label: "Deals", icon: CircleDollarSign },
  { id: "clients", label: "Clients", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] satisfies Array<{
  id: TelegramAdSalesTab;
  label: string;
  icon: typeof CalendarRange;
}>;

const rangeModes = [
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "threeMonths", label: "3 months", icon: CalendarDays },
] satisfies Array<{
  id: TelegramAdSalesCalendarRangeMode;
  label: string;
  icon: typeof CalendarRange;
}>;

function secondaryButton(active = false) {
  return active
    ? "border-blue-500 bg-blue-600 text-white"
    : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500 hover:text-white";
}

export function AdSalesWorkspaceHero({
  from,
  to,
  rangeMode,
  rangeSelection,
  activeTab,
  onRangeModeChange,
  onRangeChange,
  onShiftRange,
  onToday,
  onTabChange,
}: {
  from: Date;
  to: Date;
  rangeMode: TelegramAdSalesCalendarRangeMode;
  rangeSelection: { from: string; to: string } | null;
  activeTab: TelegramAdSalesTab;
  onRangeModeChange: (mode: TelegramAdSalesCalendarRangeMode) => void;
  onRangeChange: (range: { from: string; to: string }) => void;
  onShiftRange: (direction: -1 | 1) => void;
  onToday: () => void;
  onTabChange: (tab: TelegramAdSalesTab) => void;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-[18px] border border-neutral-800 bg-[#111111]">
      <nav
        aria-label="Ad sales sections"
        className="flex overflow-x-auto px-2"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`relative inline-flex h-14 shrink-0 items-center gap-2 px-4 text-sm font-medium transition ${
                activeTab === item.id
                  ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-500"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "calendar" ? (
        <div className="flex flex-col gap-3 border-t border-neutral-800 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {rangeModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onRangeModeChange(mode.id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition ${secondaryButton(
                    rangeMode === mode.id,
                  )}`}
                >
                  <Icon size={15} />
                  {mode.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous slot period"
                onClick={() => onShiftRange(-1)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${secondaryButton()}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={onToday}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium ${secondaryButton()}`}
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next slot period"
                onClick={() => onShiftRange(1)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${secondaryButton()}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <DateRangeInput
              from={rangeSelection?.from || channelLocalDateKey(from)}
              to={rangeSelection?.to || channelLocalDateKey(to)}
              onChange={onRangeChange}
              className="w-full sm:w-[320px]"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
