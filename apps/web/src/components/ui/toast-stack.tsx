"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Info, LoaderCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useOptionalI18n } from "@/providers/i18n-provider";

export type ToastItem = {
  id: number | string;
  message: string;
  title?: string;
  tone?: "success" | "error" | "info" | "loading";
  iconEmoji?: string;
  iconUrl?: string;
  progress?: { current: number; total: number };
  progressSummary?: { successful: number; failed: number };
  cancelable?: boolean;
  details?: string;
};

export function ToastStack({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose: (id: number | string) => void;
}) {
  const t = useOptionalI18n()?.t;
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let element = document.getElementById("app-notification-stack");
    if (!element) {
      element = document.createElement("div");
      element.id = "app-notification-stack";
      element.className =
        "fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 pointer-events-none";
      document.body.appendChild(element);
    }
    setHost(element);
  }, []);

  if (!host) return null;

  return createPortal(
    <>
      {items.map((item) => {
        const tone = item.tone || "info";
        const styles = {
          success: {
            card: "border-emerald-700/70 bg-emerald-950/95",
            icon: "bg-emerald-500/15 text-emerald-300",
            bar: "bg-emerald-400",
            title: t?.("common.success") ?? "Success",
          },
          error: {
            card: "border-red-700/70 bg-red-950/95",
            icon: "bg-red-500/15 text-red-300",
            bar: "bg-red-400",
            title: t?.("common.error.short") ?? "Something went wrong",
          },
          info: {
            card: "border-blue-700/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-400",
            title: t?.("common.information") ?? "Information",
          },
          loading: {
            card: "border-blue-600/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-500",
            title: t?.("common.processing") ?? "Processing",
          },
        }[tone];
        const StatusIcon =
          tone === "success"
            ? CircleCheck
            : tone === "error"
              ? CircleX
              : tone === "loading"
                ? LoaderCircle
                : Info;
        const percentage = item.progress?.total
          ? Math.min(100, (item.progress.current / item.progress.total) * 100)
          : 0;
        return (
          <div
            key={item.id}
            role={tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto overflow-hidden rounded-xl border p-3.5 text-neutral-100 shadow-2xl backdrop-blur-md [animation:notification-in_180ms_ease-out] ${styles.card}`}
          >
            <div className="flex items-start gap-3">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : item.iconEmoji ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">
                  {item.iconEmoji}
                </span>
              ) : (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
                >
                  <StatusIcon
                    size={19}
                    className={tone === "loading" ? "animate-spin" : ""}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {item.title || styles.title}
                  </p>
                  {item.progress ? (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {item.title === "Генерация AI Posting" ? `${Math.round(percentage)}%` : `${item.progress.current}/${item.progress.total}`}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm leading-5 text-neutral-300">
                  {item.message}
                </p>
                {item.progress ? (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${styles.bar}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                ) : null}
                {item.progressSummary ? (
                  <div className="mt-2 flex gap-3 text-xs font-medium tabular-nums">
                    <span className="text-emerald-300">
                      {item.progressSummary.successful} successful
                    </span>
                    <span className="text-rose-300">
                      {item.progressSummary.failed} failed
                    </span>
                  </div>
                ) : null}
                {item.details ? (
                  <p className="mt-2 text-xs text-neutral-400">
                    {item.details}
                  </p>
                ) : null}
              </div>
              {tone !== "loading" || item.cancelable ? (
                <button
                  type="button"
                  aria-label={
                    item.cancelable
                      ? (t?.("common.stopOperation") ?? "Stop operation")
                      : (t?.("common.closeNotification") ??
                        "Close notification")
                  }
                  title={
                    item.cancelable
                      ? (t?.("common.stopOperation") ?? "Stop operation")
                      : undefined
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white"
                  onClick={() => onClose(item.id)}
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>,
    host,
  );
}
