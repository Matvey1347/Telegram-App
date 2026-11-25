"use client";

import {
  Archive,
  CalendarDays,
  CircleCheck,
  Link2,
  Megaphone,
} from "lucide-react";

const sections = [
  { id: "promos", label: "Promos", icon: Megaphone },
  { id: "placements", label: "Placements", icon: CalendarDays },
  { id: "links", label: "Links", icon: Link2 },
] as const;

const statuses = [
  { id: "active", label: "Active", icon: CircleCheck },
  { id: "archive", label: "Archive", icon: Archive },
] as const;

export type BotAdsTab = (typeof sections)[number]["id"];
export type BotAdPromoTab = (typeof statuses)[number]["id"];

export function BotAdsTabs(props: {
  value: BotAdsTab;
  onChange: (value: BotAdsTab) => void;
}) {
  return <TabStrip {...props} options={sections} label="Ads sections" />;
}

export function BotAdPromoTabs(props: {
  value: BotAdPromoTab;
  onChange: (value: BotAdPromoTab) => void;
}) {
  return <TabStrip {...props} options={statuses} label="Promo status" />;
}

function TabStrip<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; icon: typeof Link2 }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1"
    >
      {options.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          tabIndex={value === id ? 0 : -1}
          className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 sm:px-4 ${value === id ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            const next = {
              ArrowLeft: (index + options.length - 1) % options.length,
              ArrowRight: (index + 1) % options.length,
              Home: 0,
              End: options.length - 1,
            }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            onChange(options[next].id);
            (
              event.currentTarget.parentElement?.children[next] as
                | HTMLButtonElement
                | undefined
            )?.focus();
          }}
        >
          <Icon size={16} aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}
