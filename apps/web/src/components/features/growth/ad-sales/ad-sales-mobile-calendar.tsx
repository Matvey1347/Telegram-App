"use client";

import { formatDateWithWeekday } from "@/lib/date-format";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

export type MobileCalendarDay = {
  date: Date;
  outsideMonth: boolean;
  isToday: boolean;
  revenue: string[];
  sales: Array<{
    saleId: string;
    label: string;
    amount: string;
    advertiserPhotoUrl: string | null;
    placementCount: number;
  }>;
};

export function AdSalesMobileCalendar({
  days,
  onOpenSale,
}: {
  days: MobileCalendarDay[];
  onOpenSale: (saleId: string) => void;
}) {
  const relevantDays = days.filter((day) => day.sales.length || day.isToday);

  return (
    <div className="space-y-2 md:hidden">
      {relevantDays.map((day) => (
        <section
          key={day.date.toISOString()}
          className={`rounded-xl border p-3 ${
            day.outsideMonth
              ? "border-neutral-800 bg-neutral-950/50 text-neutral-400"
              : "border-neutral-800 bg-neutral-900/70"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                {formatDateWithWeekday(day.date)}
              </h3>
              {day.isToday ? (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Today
                </span>
              ) : null}
            </div>
            {day.revenue.length ? (
              <span className="shrink-0 text-sm font-semibold text-emerald-300">
                {day.revenue.join(" · ")}
              </span>
            ) : null}
          </div>
          {day.sales.length ? (
            <div className="mt-3 space-y-2">
              {day.sales.map((sale) => (
                <button
                  key={sale.saleId}
                  type="button"
                  onClick={() => onOpenSale(sale.saleId)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-sky-800/70 bg-sky-950/20 px-2.5 py-2 text-left text-sm text-sky-100 transition hover:border-sky-500"
                >
                  <TelegramEntityAvatar
                    imageUrl={sale.advertiserPhotoUrl}
                    kind="person"
                    alt={sale.label}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {sale.label}
                    {sale.placementCount > 1
                      ? ` · ${sale.placementCount} placements`
                      : ""}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-emerald-300">
                    {sale.amount}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-500">No booked placements.</p>
          )}
        </section>
      ))}
    </div>
  );
}
