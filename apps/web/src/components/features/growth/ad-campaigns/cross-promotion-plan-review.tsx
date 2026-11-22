import { Circle } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export type CrossPromotionReviewRow = {
  side: string;
  channel: string;
  date: string;
  time: string;
  format: string;
};

export function CrossPromotionPlanReview({
  title,
  partner,
  emptyPartnerText = "Partner can be added later",
  rows,
  onEdit,
}: {
  title: string;
  partner: string;
  emptyPartnerText?: string;
  rows: CrossPromotionReviewRow[];
  onEdit: (step: number) => void;
}) {
  const dates = [
    ...new Set(rows.map((row) => row.date).filter(Boolean)),
  ].sort();
  const byDate = dates.map((date) => {
    const dayRows = rows.filter((row) => row.date === date);
    const unique = (key: "time" | "format") => [
      ...new Set(dayRows.map((row) => row[key]).filter(Boolean)),
    ];
    const times = unique("time");
    const formats = unique("format");
    return {
      date,
      sides: [...new Set(dayRows.map((row) => row.side))].join(" · "),
      channels: [...new Set(dayRows.map((row) => row.channel))],
      time: times.length === 1 ? times[0] : "Mixed",
      format: formats.length === 1 ? formats[0] : "Mixed",
    };
  });

  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Review promotion</h3>
          <p className="mt-1 text-sm text-neutral-400">
            {title.trim() || "Untitled promotion"}
            {partner ? ` · ${partner}` : ` · ${emptyPartnerText}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300">
          <Circle
            size={8}
            aria-hidden="true"
            className="animate-pulse fill-emerald-400 text-emerald-400"
          />
          Live preview
        </span>
      </div>

      <div className="space-y-2">
        {byDate.length ? (
          byDate.map((item) => (
            <div
              key={item.date}
              className="grid gap-x-4 gap-y-1 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm sm:grid-cols-[minmax(100px,.7fr)_minmax(0,1.5fr)]"
            >
              <strong className="text-white">{item.date}</strong>
              <div className="min-w-0 space-y-1 text-neutral-400">
                <p className="truncate">{item.sides || "Publication"}</p>
                <p>
                  Time: {item.time} · Format: {item.format}
                </p>
                {item.channels.length ? (
                  <p className="truncate">{item.channels.join(", ")}</p>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-neutral-800 p-3 text-sm text-neutral-500">
            Dates, times, and formats will appear here as you configure
            placements.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
        <Button type="button" variant="secondary" onClick={() => onEdit(0)}>
          Campaign
        </Button>
        <Button type="button" variant="secondary" onClick={() => onEdit(1)}>
          My side
        </Button>
        <Button type="button" variant="secondary" onClick={() => onEdit(2)}>
          {partner ? "Partner side" : "Placements"}
        </Button>
      </div>
    </section>
  );
}
