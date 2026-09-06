"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function CalendarManualSchedulerPanel({
  candidateCount,
  selectedCount,
  busy,
  onClear,
  children,
}: {
  candidateCount: number;
  selectedCount: number;
  busy: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <section
      className="mt-6 border-t border-neutral-800 pt-5"
      aria-labelledby="calendar-manual-scheduler-title"
    >
      <div>
        <h4
          id="calendar-manual-scheduler-title"
          className="text-sm font-semibold text-white"
        >
          {t("telegram.posts.calendar.scheduleMultiple")}
        </h4>
        <p className="mt-1 text-xs text-neutral-400">
          {t("telegram.posts.calendar.scheduleMultipleHint")}
        </p>
      </div>
      {!candidateCount ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-800 px-4 py-5 text-sm text-neutral-500">
          {t("telegram.posts.calendar.noDrafts")}
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-neutral-500">
              {t("telegram.posts.calendar.postsToSchedule")}
            </div>
            <div className="flex items-center gap-2">
              <div className="whitespace-nowrap text-xs tabular-nums text-neutral-500">
                {t("telegram.posts.calendar.selected", {
                  count: selectedCount,
                })}
              </div>
              {selectedCount ? (
                <Button
                  variant="secondary"
                  onClick={onClear}
                  disabled={busy}
                  className="h-8 border-neutral-700 bg-neutral-950 px-2.5 text-xs text-neutral-300 hover:border-red-800 hover:bg-red-950/30 hover:text-red-100"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <X size={13} />
                    {t("common.clear")}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
          {children}
        </>
      )}
    </section>
  );
}
