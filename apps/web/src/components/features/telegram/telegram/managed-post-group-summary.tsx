"use client";

import { type PostGroup } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";

export function GroupSummary({
  summary,
}: {
  summary: PostGroup["statusSummary"];
}) {
  const { t } = useI18n();
  const visibleStatuses = [
    {
      label: t("telegramPosts.status.draft"),
      count: summary.draftCount,
      emoji: "📝",
      className: "border-blue-800/70 bg-blue-950/30 text-blue-200",
    },
    {
      label: t("telegramPosts.status.scheduled"),
      count: summary.scheduledCount,
      emoji: "🕒",
      className: "border-amber-800/70 bg-amber-950/30 text-amber-200",
    },
    {
      label: t("telegramPosts.status.published"),
      count: summary.publishedCount,
      emoji: "✅",
      className: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
    },
    {
      label: t("telegramPosts.status.failed"),
      count: summary.failedCount,
      emoji: "⚠️",
      className: "border-red-800/70 bg-red-950/30 text-red-200",
    },
  ].filter((item) => item.count > 0);
  return (
    <div className="space-y-2">
      {visibleStatuses.length ? (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {visibleStatuses.map((item) => (
            <div
              key={item.label}
              className={`flex min-w-[92px] flex-1 items-center justify-center gap-2 rounded-md border px-2 py-2 ${item.className}`}
            >
              <span className="text-sm">{item.emoji}</span>
              <span>
                <span className="mr-1 font-semibold text-white">
                  {item.count}
                </span>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
