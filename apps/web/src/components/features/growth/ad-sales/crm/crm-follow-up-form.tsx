"use client";

import { useState } from "react";
import { Button, DateInput, FormField, Input, TimeInput, localDateTimeInputToIso } from "@/components/ui/primitives";
import { useCrmSalesCopy } from "./crm-sales-copy";

function localParts(iso?: string) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}
export function CrmFollowUpForm({ initialAt, initialTitle, pending, error, mode, onSubmit }: {
  initialAt?: string; initialTitle?: string; pending: boolean; error: boolean;
  mode: "schedule" | "reschedule" | "snooze";
  onSubmit: (at: string, title: string) => Promise<void>;
}) {
  const t = useCrmSalesCopy();
  const [initial] = useState(() => localParts(initialAt));
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [title, setTitle] = useState(initialTitle ?? t("crmSales.defaultTitle"));
  const at = localDateTimeInputToIso(date, time);
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (at) void onSubmit(at, title.trim()).catch(() => { /* Mutation owns error feedback. */ }); }}>
    {mode === "schedule" ? <FormField label={t("crmSales.title")}><Input aria-label={t("crmSales.title")} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} /></FormField> : null}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label={t("crmSales.date")}><DateInput aria-label={t("crmSales.date")} value={date} required onChange={(event) => setDate(event.target.value)} /></FormField>
      <FormField label={t("crmSales.time")}><TimeInput aria-label={t("crmSales.time")} value={time} required onChange={(event) => setTime(event.target.value)} /></FormField>
    </div>
    {!at ? <p role="alert" className="text-xs text-amber-300">{t("crmSales.invalidTime")}</p> : null}
    {error ? <p role="alert" className="text-xs text-rose-300">{t("crmSales.saveError")}</p> : null}
    <Button type="submit" className="min-h-11 w-full" disabled={pending || !at || (mode === "schedule" && !title.trim())}>{t("crmSales.save")}</Button>
  </form>;
}
