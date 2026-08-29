"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { uiCopy, type UiLocale } from "@/lib/ui-i18n";

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const locale = props.lang === "ru" ? "ru-RU" : undefined;
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [value, setValue] = useState(
    String(props.value ?? props.defaultValue ?? ""),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.value !== undefined) setValue(String(props.value || ""));
  }, [props.value]);

  const initialDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      let boundaryTop = 0;
      let boundaryBottom = window.innerHeight;
      let ancestor = rootRef.current.parentElement;
      while (ancestor) {
        const overflowY = window.getComputedStyle(ancestor).overflowY;
        if (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "hidden"
        ) {
          const boundary = ancestor.getBoundingClientRect();
          boundaryTop = Math.max(0, boundary.top);
          boundaryBottom = Math.min(window.innerHeight, boundary.bottom);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      const estimatedHeight = 340;
      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  const commit = (next: string) => {
    setValue(next);
    if (props.onChange) {
      props.onChange({ target: { name: props.name, value: next } } as any);
    }
  };

  const monthStartDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
  ).getDay();
  const pad = (monthStartDay + 6) % 7;
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    0,
  ).getDate();

  const cells: Array<{ iso: string; day: number; muted: boolean }> = [];
  for (let i = 0; i < pad; i += 1) {
    const day = prevMonthDays - pad + i + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, day);
    cells.push({ iso: formatLocalDate(d), day, muted: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ iso: formatLocalDate(d), day, muted: false });
  }
  while (cells.length < 42) {
    const day = cells.length - (pad + daysInMonth) + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
    cells.push({ iso: formatLocalDate(d), day, muted: true });
  }

  const selectedIso = value || "";
  const display = selectedIso
    ? selectedIso.split("-").reverse().join(".")
    : props.placeholder || "Select date";

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" {...(props as any)} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-9 w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
      >
        <span className={selectedIso ? "text-white" : "text-neutral-400"}>
          {display}
        </span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-[min(300px,calc(100vw-2rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? "bottom-full mb-1" : "mt-1"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium">
              {cursor.toLocaleString(locale, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {(locale === "ru-RU"
              ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
              : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
            ).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const selected = cell.iso === selectedIso;
              return (
                <button
                  key={`${cell.iso}-${cell.day}`}
                  type="button"
                  onClick={() => {
                    commit(cell.iso);
                    setOpen(false);
                  }}
                  className={`rounded px-1 py-1.5 text-sm ${selected ? "bg-blue-600 text-white" : cell.muted ? "text-neutral-500 hover:bg-neutral-800" : "text-white hover:bg-neutral-800"}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button
              type="button"
              className="text-neutral-400 hover:text-white"
              onClick={() => commit("")}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-blue-300 hover:text-blue-200"
              onClick={() => {
                const now = new Date();
                const iso = formatLocalDate(now);
                commit(iso);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DateRangeInputProps = {
  from?: string;
  to?: string;
  onChange: (range: { from: string; to: string }) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  uiLocale?: UiLocale;
};
function formatLocalDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDisplayDate(value?: string) {
  return value ? value.split("-").reverse().join(".") : "";
}
function monthCells(cursor: Date) {
  const monthStartDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
  ).getDay();
  const pad = (monthStartDay + 6) % 7;
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    0,
  ).getDate();
  const cells: Array<{ iso: string; day: number; muted: boolean }> = [];

  for (let i = 0; i < pad; i += 1) {
    const day = prevMonthDays - pad + i + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: false });
  }
  while (cells.length < 42) {
    const day = cells.length - (pad + daysInMonth) + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: true });
  }
  return cells;
}

export function DateRangeInput({
  from = "",
  to = "",
  onChange,
  disabled,
  className = "",
  placeholder,
  uiLocale,
}: DateRangeInputProps) {
  const ui = uiCopy(uiLocale);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = from || to;
    const date = base ? new Date(`${base}T00:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectingEnd, setSelectingEnd] = useState(Boolean(from && !to));

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 360;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  const display =
    start || end
      ? start && end && start === end
        ? formatDisplayDate(start)
        : `${formatDisplayDate(start)}${end ? ` - ${formatDisplayDate(end)}` : ""}`
      : (placeholder ?? ui.selectPeriod);
  const cells = monthCells(cursor);

  const pick = (iso: string) => {
    if (!selectingEnd || !from) {
      onChange({ from: iso, to: "" });
      setSelectingEnd(true);
      return;
    }
    const next = iso < from ? { from: iso, to: from } : { from, to: iso };
    onChange(next);
    setSelectingEnd(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className={start || end ? "text-white" : "text-neutral-400"}>
          {display}
        </span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div
          className={`absolute right-0 z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? "bottom-full mb-1" : "mt-1"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium">
              {cursor.toLocaleString(
                uiLocale === "uk"
                  ? "uk-UA"
                  : uiLocale === "ru"
                    ? "ru-RU"
                    : "en-US",
                {
                  month: "long",
                  year: "numeric",
                },
              )}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-2 text-xs text-neutral-400">
            {selectingEnd ? ui.selectEndDate : ui.selectStartDate}
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {ui.weekdays.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const selected = cell.iso === start || cell.iso === end;
              const inRange = Boolean(
                start && end && cell.iso > start && cell.iso < end,
              );
              return (
                <button
                  key={`${cell.iso}-${cell.day}`}
                  type="button"
                  onClick={() => pick(cell.iso)}
                  className={`rounded px-1 py-1.5 text-sm ${selected ? "bg-blue-600 text-white" : inRange ? "bg-blue-950 text-blue-100" : cell.muted ? "text-neutral-500 hover:bg-neutral-800" : "text-white hover:bg-neutral-800"}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <button
              type="button"
              className="text-neutral-400 hover:text-white"
              onClick={() => {
                onChange({ from: "", to: "" });
                setSelectingEnd(false);
              }}
            >
              {ui.clear}
            </button>
            <button
              type="button"
              className="text-blue-300 hover:text-blue-200"
              onClick={() => {
                const iso = formatLocalDateValue(new Date());
                onChange({ from: iso, to: iso });
                setSelectingEnd(false);
                setOpen(false);
              }}
            >
              {ui.today}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

