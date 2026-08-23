"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Info,
  Settings2,
  Users,
} from "lucide-react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import type {
  TelegramAdSalesCalendarRangeMode,
  TelegramAdSalesTab,
} from "@/lib/features/growth/telegram-ad-sales";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";
import {
  DateRangeInput,
  FormField,
  MultiSelect,
  Select,
  Tooltip,
} from "@/components/ui/primitives";

const tabs: Array<{
  id: TelegramAdSalesTab;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "calendar", label: "Slots", icon: CalendarRange },
  { id: "sales", label: "Deals", icon: CircleDollarSign },
  { id: "clients", label: "Clients", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Setup", icon: Settings2 },
];

const rangeModes: Array<{
  id: TelegramAdSalesCalendarRangeMode;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "threeMonths", label: "3 months", icon: CalendarDays },
];

const tabDescriptions: Record<TelegramAdSalesTab, string> = {
  calendar: "See ad opportunities and switch between calendar and list layout.",
  sales: "Track reserved, confirmed, paid, published, and completed placements.",
  clients: "Review advertisers by revenue, segment, owner, urgency, and next task.",
  analytics: "See revenue, fill rate, overdue payments, and channel performance.",
  settings: "Configure formats, audience baseline, and organic posting rules.",
};

function rangeButtonClass(active: boolean) {
  return active
    ? "border-blue-500 bg-blue-600 text-white"
    : "border-slate-800 bg-[#0b1220] text-slate-300 hover:border-slate-700 hover:text-white";
}

export function AdSalesWorkspaceHero({
  from,
  to,
  rangeMode,
  rangeSelection,
  activeTab,
  selectedNetworkId,
  selectedChannelIds,
  networks,
  channels,
  onRangeModeChange,
  onRangeChange,
  onShiftRange,
  onToday,
  onNetworkChange,
  onChannelsChange,
  onTabChange,
}: {
  from: Date;
  to: Date;
  rangeMode: TelegramAdSalesCalendarRangeMode;
  rangeSelection: { from: string; to: string } | null;
  activeTab: TelegramAdSalesTab;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onRangeModeChange: (mode: TelegramAdSalesCalendarRangeMode) => void;
  onRangeChange: (range: { from: string; to: string }) => void;
  onShiftRange: (direction: -1 | 1) => void;
  onToday: () => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  onTabChange: (tab: TelegramAdSalesTab) => void;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-[22px] border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_36%),#111827]">
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)] xl:p-6">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-400">
              Sales workspace
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {from.toLocaleDateString()} - {to.toLocaleDateString()}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              Manage availability, deals, clients, and performance for the selected inventory.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rangeModes.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => onRangeModeChange(view.id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition ${rangeButtonClass(rangeMode === view.id)}`}
                >
                  <Icon size={15} />
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0b1220]/80 p-4 md:grid-cols-2">
          <FormField label="Network">
            <Select value={selectedNetworkId} onChange={(event) => onNetworkChange(event.target.value)}>
              <option value="">All networks</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Channels">
            <MultiSelect
              value={selectedChannelIds}
              onChange={onChannelsChange}
              placeholder="Choose channels"
              allSelectedLabel="All channels"
              options={channels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                selectedLabel: channel.title,
                iconUrl: channel.photoUrl,
                iconFallback: channel.title,
              }))}
            />
          </FormField>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous reporting period" onClick={() => onShiftRange(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#0b1220] text-slate-300 transition hover:border-slate-700 hover:text-white">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={onToday} className="inline-flex h-10 items-center rounded-xl border border-slate-800 bg-[#0b1220] px-4 text-sm font-medium text-white transition hover:border-slate-700">
            Today
          </button>
          <button type="button" aria-label="Next reporting period" onClick={() => onShiftRange(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#0b1220] text-slate-300 transition hover:border-slate-700 hover:text-white">
            <ChevronRight size={16} />
          </button>
        </div>
        <DateRangeInput
          from={rangeSelection?.from || channelLocalDateKey(from)}
          to={rangeSelection?.to || channelLocalDateKey(to)}
          onChange={onRangeChange}
          className="w-full lg:w-[320px]"
        />
      </div>

      <nav aria-label="Ad sales sections" className="flex overflow-x-auto border-t border-slate-800/80 px-3">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.id} side="top" align="center" content={<span className="block w-72">{tabDescriptions[item.id]}</span>}>
              <button
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative inline-flex h-14 shrink-0 items-center gap-2 px-4 text-sm font-medium transition ${activeTab === item.id ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-500" : "text-slate-400 hover:text-white"}`}
              >
                <Icon size={16} />
                {item.label}
                <Info size={14} className="text-slate-400" />
              </button>
            </Tooltip>
          );
        })}
      </nav>
    </section>
  );
}
