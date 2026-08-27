import type { TelegramAdSale } from "@telegram-system/shared";
import { Eye, Forward, MessageCircle, Smile } from "lucide-react";

type PostMetricKey =
  | "viewsCount"
  | "reactionsCount"
  | "forwardsCount"
  | "commentsCount";

export function sumAdSalePostMetric(
  sale: TelegramAdSale,
  key: PostMetricKey,
) {
  return sale.placements.reduce(
    (total, placement) => total + (placement.telegramPost?.[key] ?? 0),
    0,
  );
}

export function AdSalePostMetrics(props: {
  sale: TelegramAdSale;
  className?: string;
}) {
  return (
    <PostMetrics
      className={props.className}
      views={sumAdSalePostMetric(props.sale, "viewsCount")}
      reactions={sumAdSalePostMetric(props.sale, "reactionsCount")}
      comments={sumAdSalePostMetric(props.sale, "commentsCount")}
      forwards={sumAdSalePostMetric(props.sale, "forwardsCount")}
    />
  );
}

export function PostMetrics(props: {
  views: number | null;
  reactions: number | null;
  comments: number | null;
  forwards: number | null;
  className?: string;
}) {
  const metrics = [
    { label: "Views", value: props.views ?? 0, icon: Eye },
    { label: "Reactions", value: props.reactions ?? 0, icon: Smile },
    { label: "Comments", value: props.comments ?? 0, icon: MessageCircle },
    { label: "Forwards", value: props.forwards ?? 0, icon: Forward },
  ];

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400 ${props.className ?? ""}`}
      aria-label="Ad activity"
    >
      {metrics.map((metric) => (
          <span
            key={metric.label}
            title={metric.label}
            aria-label={`${metric.label}: ${metric.value}`}
            className="inline-flex items-center gap-1 tabular-nums"
          >
            <metric.icon size={13} aria-hidden="true" />
            {metric.value.toLocaleString()}
          </span>
      ))}
    </div>
  );
}
