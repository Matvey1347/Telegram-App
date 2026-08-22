import { Eye, Forward, MessageCircle, Smile } from "lucide-react";
import type { TelegramPostEngagementMetrics } from "@telegram-system/shared";

type TelegramPostEngagementProps = {
  engagement: TelegramPostEngagementMetrics | TelegramPostEngagementMetrics[];
};

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" });

export function formatTelegramEngagementCount(value: number | null) {
  return value == null ? "—" : numberFormatter.format(value);
}

export function formatTelegramEngagementRate(value: number | null) {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

export function TelegramPostEngagement({
  engagement,
}: TelegramPostEngagementProps) {
  const metrics = Array.isArray(engagement) ? engagement : [engagement];

  return (
    <div
      aria-label="Telegram post engagement"
      className="space-y-2 rounded-xl border border-[#324557] bg-[#17212b]/95 p-3 text-[#d7e3ec] shadow-md"
    >
      {metrics.map((metric, metricIndex) => {
        const counts = [
          { label: "Views", value: metric.viewsCount, icon: Eye },
          { label: "Reactions", value: metric.reactionsCount, icon: Smile },
          {
            label: "Comments",
            value: metric.commentsCount,
            icon: MessageCircle,
          },
          { label: "Forwards", value: metric.forwardsCount, icon: Forward },
        ];
        const rates = [
          { label: "ERR", value: metric.err },
          { label: "Reaction rate", value: metric.reactionRate },
          { label: "Comment rate", value: metric.commentRate },
          { label: "Forward rate", value: metric.forwardRate },
        ];
        return (
          <div key={metric.telegramPostId} className="space-y-2">
            {metrics.length > 1 ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#7f91a4]">
                Telegram message {metricIndex + 1} · ID{" "}
                {metric.telegramMessageId}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {counts.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  aria-label={label}
                  title={label}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-[#101c27] px-2.5 py-2"
                >
                  <Icon
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-[#7f91a4]"
                  />
                  <div className="text-sm font-semibold tabular-nums text-white">
                    {formatTelegramEngagementCount(value)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#9fb2c3]">
              {rates.map(({ label, value }) => (
                <span key={label}>
                  {label}:{" "}
                  <strong className="font-medium text-[#d7e3ec]">
                    {formatTelegramEngagementRate(value)}
                  </strong>
                </span>
              ))}
            </div>
            {metric.reactions?.length ? (
              <div
                className="flex flex-wrap gap-1.5"
                aria-label="Reaction breakdown"
              >
                {metric.reactions.map((reaction) => (
                  <span
                    key={reaction.reaction}
                    className="rounded-full border border-[#3a5063] bg-[#223243] px-2 py-0.5 text-xs tabular-nums text-white"
                  >
                    {reaction.reaction}{" "}
                    {formatTelegramEngagementCount(reaction.count)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
