
import { Eye, Forward, MessageCircle, Smile } from "lucide-react";
import type { TelegramPostEngagementMetrics } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";

type TelegramPostEngagementProps = {
  engagement: TelegramPostEngagementMetrics | TelegramPostEngagementMetrics[];
};

export function formatTelegramEngagementCount(value: number | null, locale = "en") {
  return value == null ? "—" : new Intl.NumberFormat(locale, { notation: "compact" }).format(value);
}

export function formatTelegramEngagementRate(value: number | null) {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

export function TelegramPostEngagement({
  engagement,
}: TelegramPostEngagementProps) {
  const { locale, t } = useI18n();
  const metrics = Array.isArray(engagement) ? engagement : [engagement];

  return (
    <div
      aria-label={t("telegram.posts.editorComponents.engagement.label")}
      className="space-y-2 rounded-xl border border-[#324557] bg-[#17212b]/95 p-3 text-[#d7e3ec] shadow-md"
    >
      {metrics.map((metric, metricIndex) => {
        const counts = [
          { label: t("telegram.posts.editorComponents.engagement.views"), value: metric.viewsCount, icon: Eye },
          { label: t("telegram.posts.editorComponents.engagement.reactions"), value: metric.reactionsCount, icon: Smile },
          {
            label: t("telegram.posts.editorComponents.engagement.comments"),
            value: metric.commentsCount,
            icon: MessageCircle,
          },
          { label: t("telegram.posts.editorComponents.engagement.forwards"), value: metric.forwardsCount, icon: Forward },
        ];
        const rates = [
          { label: "ERR", value: metric.err },
          { label: t("telegram.posts.editorComponents.engagement.reactionRate"), value: metric.reactionRate },
          { label: t("telegram.posts.editorComponents.engagement.commentRate"), value: metric.commentRate },
          { label: t("telegram.posts.editorComponents.engagement.forwardRate"), value: metric.forwardRate },
        ];
        return (
          <div key={metric.telegramPostId} className="space-y-2">
            {metrics.length > 1 ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#7f91a4]">
                {t("telegram.posts.editorComponents.engagement.message", { number: metricIndex + 1, id: metric.telegramMessageId })}
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
                    {formatTelegramEngagementCount(value, locale)}
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
                aria-label={t("telegram.posts.editorComponents.engagement.reactionBreakdown")}
              >
                {metric.reactions.map((reaction) => (
                  <span
                    key={reaction.reaction}
                    className="rounded-full border border-[#3a5063] bg-[#223243] px-2 py-0.5 text-xs tabular-nums text-white"
                  >
                    {reaction.reaction}{" "}
                    {formatTelegramEngagementCount(reaction.count, locale)}
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
