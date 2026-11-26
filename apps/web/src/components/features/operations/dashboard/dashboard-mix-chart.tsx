"use client";

import { useState, type ReactNode } from "react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type { LucideIcon } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";

export type DashboardMixSegment = {
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
  iconPresentation?: ResolvedEmoji | null;
  key?: string;
};

function ringPoint(percent: number) {
  const angle = (percent / 100) * 2 * Math.PI;
  return `${72 + 60 * Math.cos(angle)} ${72 + 60 * Math.sin(angle)}`;
}

export function DashboardMixChart({
  title,
  segments,
  format,
  percent,
}: {
  title: string;
  segments: DashboardMixSegment[];
  format: (amount: number) => ReactNode;
  percent: (value: number | null) => string;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const total = segments.reduce(
    (sum, item) => sum + Math.max(0, item.value),
    0,
  );
  const hasNegative = segments.some(({ value }) => value < 0);
  const net = segments.reduce((sum, { value }) => sum + value, 0);
  const share = (value: number) => (total > 0 && !hasNegative ? (100 * value) / total : null);
  const active = segments.find(
    ({ key, label }) => (key ?? label) === highlighted,
  );
  const arcs: { id: string; color: string; start: number; span: number }[] = [];
  let start = 0;
  for (const { key, label, value, color } of segments) {
    if (value <= 0 || total <= 0) continue;
    const span = (100 * value) / total;
    arcs.push({ id: key ?? label, color, start, span });
    start += span;
  }

  return (
    <section
      aria-label={title}
      className="@container min-w-0 rounded-lg border border-neutral-800 p-3"
    >
      <h4 className="text-sm font-medium text-neutral-200">{title}</h4>
      <div className="relative mx-auto my-4 aspect-square w-36 @[26rem]:w-40">
        <svg
          aria-hidden="true"
          viewBox="0 0 144 144"
          className="h-full w-full -rotate-90"
        >
          <circle
            cx="72"
            cy="72"
            r="60"
            fill="none"
            strokeWidth="13"
            className="stroke-neutral-800"
          />
          {arcs.map(({ id, color, start, span }) => {
            const props = {
              "data-segment": id,
              fill: "none",
              stroke: color,
              strokeWidth: 13,
              opacity: highlighted && highlighted !== id ? 0.38 : 1,
              className: "cursor-pointer transition-opacity",
              onPointerEnter: () => setHighlighted(id),
              onPointerLeave: () => setHighlighted(null),
            };
            return span >= 100 ? (
              <circle key={id} {...props} cx="72" cy="72" r="60" />
            ) : (
              <path
                key={id}
                {...props}
                strokeLinecap="butt"
                d={`M ${ringPoint(start)} A 60 60 0 ${span > 50 ? 1 : 0} 1 ${ringPoint(start + span)}`}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-[19%] flex flex-col items-center justify-center gap-0.5 text-center">
          {active ? (
            <>
              {active.iconPresentation ? (
                <IconAvatar
                  icon={active.iconPresentation}
                  decorative
                  size="xs"
                />
              ) : (
                <active.Icon
                  aria-hidden
                  size={17}
                  style={{ color: active.color }}
                />
              )}
              <span className="line-clamp-2 text-xs text-neutral-300">
                {active.label}
              </span>
              <span className="max-w-full break-words text-sm font-semibold tabular-nums text-white">
                {format(active.value)}
              </span>
              <span className="text-xs text-neutral-400">
                {percent(share(active.value))}
              </span>
            </>
          ) : (
            <span className="max-w-full break-words text-sm font-semibold tabular-nums text-white">
              {segments.length ? format(net) : "—"}
            </span>
          )}
        </div>
      </div>
      <dl className="grid gap-1.5 text-sm @[29rem]:grid-cols-2">
        {segments.map(
          ({ key, label, value, color, Icon, iconPresentation }) => {
            const id = key ?? label;
            return (
              <div
                key={id}
                tabIndex={0}
                className={`min-w-0 rounded-md px-2 py-1 focus-visible:outline focus-visible:outline-sky-500 ${highlighted === id ? "bg-neutral-800" : ""}`}
                onPointerEnter={() => setHighlighted(id)}
                onPointerLeave={() => setHighlighted(null)}
                onFocus={() => setHighlighted(id)}
                onBlur={() => setHighlighted(null)}
              >
                <dt className="flex min-w-0 items-center gap-2 text-neutral-300">
                  {iconPresentation ? (
                    <IconAvatar icon={iconPresentation} decorative size="xs" />
                  ) : (
                    <Icon
                      aria-hidden="true"
                      size={16}
                      className="shrink-0"
                      style={{ color }}
                    />
                  )}
                  <span className="min-w-0 break-words">{label}</span>
                </dt>
                <dd className="flex flex-wrap gap-x-2 pl-6 tabular-nums text-white">
                  {format(value)}
                  <span className="text-neutral-400">
                    {percent(share(value))}
                  </span>
                </dd>
              </div>
            );
          },
        )}
      </dl>
    </section>
  );
}
