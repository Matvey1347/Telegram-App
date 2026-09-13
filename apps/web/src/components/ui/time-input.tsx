"use client";

import type { InputHTMLAttributes } from "react";
import { Clock3 } from "lucide-react";

export function normalizeTimeInputValue(value: string) {
  const sanitized = value.replace(/[^\d:.\s]/g, "").replace(/\s+/g, "");
  if (!sanitized) return "";
  const normalized = sanitized.replace(/\./g, ":");
  if (!normalized.includes(":")) {
    if (normalized.length <= 2) return normalized;
    return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
  }
  const [hours = "", minutes = ""] = normalized.split(":", 2);
  return `${hours.slice(0, 2)}:${minutes.slice(0, 2)}`;
}

export function canonicalizeTimeInputValue(value: string) {
  const normalized = normalizeTimeInputValue(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidTimeInputValue(value: string) {
  return canonicalizeTimeInputValue(value) !== null;
}

export function localDateTimeInputToDate(date: string, time: string) {
  const canonicalTime = canonicalizeTimeInputValue(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !canonicalTime) return null;
  const value = new Date(`${date}T${canonicalTime}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function localDateTimeInputToIso(date: string, time: string) {
  return localDateTimeInputToDate(date, time)?.toISOString() ?? null;
}

export function TimeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, onBlur, onChange, placeholder, ...restProps } = props;
  return (
    <div className="relative">
      <input
        {...restProps}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder={placeholder ?? "HH:MM"}
        onChange={(event) => {
          event.target.value = normalizeTimeInputValue(event.target.value);
          onChange?.(event);
        }}
        onBlur={(event) => {
          const canonical = canonicalizeTimeInputValue(event.target.value);
          if (canonical && canonical !== event.target.value) {
            event.target.value = canonical;
            onChange?.(event);
          }
          onBlur?.(event);
        }}
        className={`min-h-9 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 pr-11 text-sm text-white outline-none ring-blue-500 focus:ring ${className ?? ""}`}
      />
      <Clock3
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300"
      />
    </div>
  );
}
