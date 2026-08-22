"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceLocale } from "../finance-i18n";

const dateCopy = {
  en: {
    selectPeriod: "Select period",
    start: "Select start date",
    end: "Select end date",
    clear: "Clear",
    today: "Today",
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  },
  uk: {
    selectPeriod: "Оберіть період",
    start: "Оберіть початкову дату",
    end: "Оберіть кінцеву дату",
    clear: "Очистити",
    today: "Сьогодні",
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
  },
  ru: {
    selectPeriod: "Выберите период",
    start: "Выберите начальную дату",
    end: "Выберите конечную дату",
    clear: "Очистить",
    today: "Сегодня",
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  },
} as const;

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value?: string) {
  return value ? value.split("-").reverse().join(".") : "";
}

function monthCells(cursor: Date) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const pad = (start.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      index - pad + 1,
    );
    return {
      iso: localDate(date),
      day: date.getDate(),
      muted: date.getMonth() !== cursor.getMonth(),
    };
  });
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose, open]);
  return rootRef;
}

function useOpenUp(
  open: boolean,
  rootRef: React.RefObject<HTMLDivElement | null>,
  estimatedHeight: number,
) {
  const [openUp, setOpenUp] = useState(false);
  useEffect(() => {
    if (!open) return;
    const recalculate = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      let boundaryTop = 0;
      let boundaryBottom = window.innerHeight;
      let ancestor = root.parentElement;
      while (ancestor) {
        const overflowY = window.getComputedStyle(ancestor).overflowY;
        if (["auto", "scroll", "hidden"].includes(overflowY)) {
          const boundary = ancestor.getBoundingClientRect();
          boundaryTop = Math.max(0, boundary.top);
          boundaryBottom = Math.min(window.innerHeight, boundary.bottom);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      const below = boundaryBottom - rect.bottom;
      const above = rect.top - boundaryTop;
      setOpenUp(below < estimatedHeight && above > below);
    };
    recalculate();
    window.addEventListener("resize", recalculate);
    window.addEventListener("scroll", recalculate, true);
    return () => {
      window.removeEventListener("resize", recalculate);
      window.removeEventListener("scroll", recalculate, true);
    };
  }, [estimatedHeight, open, rootRef]);
  return openUp;
}

function MonthHeader({
  cursor,
  setCursor,
  locale,
}: {
  cursor: Date;
  setCursor: (date: Date) => void;
  locale: FinanceLocale;
}) {
  const intlLocale =
    locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US";
  return (
    <div className="mb-2 flex items-center justify-between">
      <button
        type="button"
        className="rounded p-1 hover:bg-neutral-800"
        onClick={() =>
          setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
        }
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <p className="text-sm font-medium">
        {cursor.toLocaleString(intlLocale, { month: "long", year: "numeric" })}
      </p>
      <button
        type="button"
        className="rounded p-1 hover:bg-neutral-800"
        onClick={() =>
          setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
        }
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const locale: FinanceLocale =
    props.lang === "ru" ? "ru" : props.lang === "uk" ? "uk" : "en";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    String(props.value ?? props.defaultValue ?? ""),
  );
  const initial = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const rootRef = useOutsideClose(open, () => setOpen(false));
  const openUp = useOpenUp(open, rootRef, 340);

  useEffect(() => {
    if (props.value !== undefined) setValue(String(props.value || ""));
  }, [props.value]);

  const commit = (next: string) => {
    setValue(next);
    props.onChange?.({
      target: { name: props.name, value: next },
    } as React.ChangeEvent<HTMLInputElement>);
  };
  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={props.name} value={value} />
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring disabled:opacity-50 ${props.className ?? ""}`}
      >
        <span className={value ? "text-white" : "text-neutral-400"}>
          {value ? displayDate(value) : props.placeholder || "Select date"}
        </span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-[min(300px,calc(100vw-2rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? "bottom-full mb-1" : "mt-1"}`}
        >
          <MonthHeader cursor={cursor} setCursor={setCursor} locale={locale} />
          <CalendarGrid
            cursor={cursor}
            locale={locale}
            start={value}
            end={value}
            onPick={(iso) => {
              commit(iso);
              setOpen(false);
            }}
          />
          <CalendarActions
            locale={locale}
            onClear={() => commit("")}
            onToday={() => {
              commit(localDate(new Date()));
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DateRangeInput({
  from = "",
  to = "",
  onChange,
  disabled,
  className = "",
  placeholder,
  uiLocale = "en",
}: {
  from?: string;
  to?: string;
  onChange: (range: { from: string; to: string }) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  uiLocale?: FinanceLocale;
}) {
  const copy = dateCopy[uiLocale];
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(Boolean(from && !to));
  const base = from || to;
  const initial = base ? new Date(`${base}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const rootRef = useOutsideClose(open, () => setOpen(false));
  const openUp = useOpenUp(open, rootRef, 360);
  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  const display =
    start || end
      ? start && end && start === end
        ? displayDate(start)
        : `${displayDate(start)}${end ? ` - ${displayDate(end)}` : ""}`
      : (placeholder ?? copy.selectPeriod);
  const pick = (iso: string) => {
    if (!selectingEnd || !from) {
      onChange({ from: iso, to: "" });
      setSelectingEnd(true);
      return;
    }
    onChange(iso < from ? { from: iso, to: from } : { from, to: iso });
    setSelectingEnd(false);
    setOpen(false);
  };
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
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
          <MonthHeader
            cursor={cursor}
            setCursor={setCursor}
            locale={uiLocale}
          />
          <div className="mb-2 text-xs text-neutral-400">
            {selectingEnd ? copy.end : copy.start}
          </div>
          <CalendarGrid
            cursor={cursor}
            locale={uiLocale}
            start={start}
            end={end}
            onPick={pick}
          />
          <CalendarActions
            locale={uiLocale}
            onClear={() => {
              onChange({ from: "", to: "" });
              setSelectingEnd(false);
            }}
            onToday={() => {
              const today = localDate(new Date());
              onChange({ from: today, to: today });
              setSelectingEnd(false);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CalendarGrid({
  cursor,
  locale,
  start,
  end,
  onPick,
}: {
  cursor: Date;
  locale: FinanceLocale;
  start?: string;
  end?: string;
  onPick: (iso: string) => void;
}) {
  const cells = useMemo(() => monthCells(cursor), [cursor]);
  return (
    <>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
        {dateCopy[locale].weekdays.map((day) => (
          <span key={day}>{day}</span>
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
              key={cell.iso}
              type="button"
              onClick={() => onPick(cell.iso)}
              className={`rounded px-1 py-1.5 text-sm ${selected ? "bg-blue-600 text-white" : inRange ? "bg-blue-950 text-blue-100" : cell.muted ? "text-neutral-500 hover:bg-neutral-800" : "text-white hover:bg-neutral-800"}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </>
  );
}

function CalendarActions({
  locale,
  onClear,
  onToday,
}: {
  locale: FinanceLocale;
  onClear: () => void;
  onToday: () => void;
}) {
  const copy = dateCopy[locale];
  return (
    <div className="mt-3 flex justify-between text-xs">
      <button
        type="button"
        className="text-neutral-400 hover:text-white"
        onClick={onClear}
      >
        {copy.clear}
      </button>
      <button
        type="button"
        className="text-blue-300 hover:text-blue-200"
        onClick={onToday}
      >
        {copy.today}
      </button>
    </div>
  );
}
