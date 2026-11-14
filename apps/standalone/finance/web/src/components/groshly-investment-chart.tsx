"use client";

import { useMemo, useState } from "react";

type Event = { id: string; date: string; at?: string; createdAt?: string; type: string; amount: number };
type Point = { id: string; date: string; at: number; value: number; type: string };

export function investmentTimeline(events: Event[]): Point[] {
  const sorted = [...events].sort((a, b) => (a.at || a.date).localeCompare(b.at || b.date) || (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id));
  let value = 0;
  return sorted.map((event) => {
    const amount = Number(event.amount) || 0;
    value = event.type === "valuation" ? amount : value + (event.type === "deposit" ? amount : -amount);
    return { id: event.id, date: event.date, at: Date.parse(event.at || event.date), value, type: event.type };
  });
}

export function GroshlyInvestmentChart({ events, currency, fmt, t, partial }: {
  events: Event[]; currency: string; fmt: (value: number, currency: string) => string;
  t: (uk: string, en: string) => string; partial?: boolean;
}) {
  const points = useMemo(() => investmentTimeline(events), [events]);
  const [selected, setSelected] = useState<string | null>(null);
  if (partial) return <p className="muted">{t("Не вдалося завантажити всю історію для точного графіка.", "The full history is needed to draw an accurate chart.")}</p>;
  if (points.length < 2) return <p className="muted">{t("Графік з’явиться після двох рухів або оцінок.", "The chart appears after at least two events or valuations.")}</p>;
  const active = points.find((point) => point.id === selected) || points.at(-1)!;
  const min = Math.min(0, ...points.map((point) => point.value));
  const max = Math.max(1, ...points.map((point) => point.value));
  const first = points[0].at, last = points.at(-1)!.at;
  const coords = points.map((point, index) => ({
    ...point,
    x: first === last ? 36 + index / (points.length - 1) * 246 : 36 + (point.at - first) / (last - first) * 246,
    y: 112 - (point.value - min) / (max - min || 1) * 85,
  }));
  const label = (type: string) => type === "deposit" ? t("Внесок", "Contribution") : type === "return" ? t("Повернення", "Return") : t("Оцінка", "Valuation");
  return <div className="investment-chart-content">
    <div className="investment-chart-selection" aria-live="polite"><span>{active.date} · {label(active.type)}</span><strong>{fmt(active.value, currency)}</strong></div>
    <svg viewBox="0 0 300 135" role="group" aria-label={t("Графік вартості інвестиції", "Investment value chart")}>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1="36" x2="282" y1={112 - 85 * fraction} y2={112 - 85 * fraction} stroke="currentColor" opacity=".14"/><text x="32" y={115 - 85 * fraction} textAnchor="end" className="investment-chart-axis">{fmt(min + (max - min) * fraction, currency)}</text></g>)}
      <polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} stroke="#5f9e79" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {coords.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r={point.id === active.id ? 5 : 3.5} fill="#5f9e79" stroke="white" strokeWidth="1.5" tabIndex={0} role="button" aria-label={`${point.date}: ${fmt(point.value, currency)} · ${label(point.type)}`} onMouseEnter={() => setSelected(point.id)} onFocus={() => setSelected(point.id)} onClick={() => setSelected(point.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(point.id); }}/>) }
    </svg>
    <div className="chart-dates"><small>{points[0].date}</small><small>{points.at(-1)!.date}</small></div>
  </div>;
}
