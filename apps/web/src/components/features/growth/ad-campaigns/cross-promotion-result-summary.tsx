import type { CrossPromotionPlan } from "@telegram-system/shared";

export function CrossPromotionResultSummary({
  plan,
}: {
  plan: CrossPromotionPlan;
}) {
  const duringPlacement = plan.targetResults.reduce(
    (sum, target) => sum + target.joinedCount + target.requestedCount,
    0,
  );
  const audienceDecline = plan.publisherResults.reduce(
    (sum, channel) => sum + (channel.subscribersLost ?? 0),
    0,
  );
  const views = plan.publisherResults.reduce(
    (sum, channel) => sum + (channel.postViews ?? 0),
    0,
  );
  return (
    <div
      className="mt-3 border-t border-white/10 px-4 py-3"
      aria-label="Mutual-promotion result"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        Mutual-promotion result
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] sm:grid-cols-3">
        <ResultStat
          label="Own publications"
          value={`${plan.placementPostIds.length} · ${plan.publisherResults.length} channels`}
        />
        <ResultStat label="Views" value={views.toLocaleString()} />
        <ResultStat
          label="During placement"
          value={`+${duringPlacement.toLocaleString()}`}
          tone="text-emerald-300"
        />
        <ResultStat
          label="Audience decline"
          value={`≈${audienceDecline.toLocaleString()}`}
          tone="text-rose-300"
        />
      </dl>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-neutral-600">{label}</dt>
      <dd className={`truncate font-medium tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
