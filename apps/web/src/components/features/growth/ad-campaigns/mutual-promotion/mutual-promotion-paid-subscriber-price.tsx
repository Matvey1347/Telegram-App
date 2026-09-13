import type { MutualPromotionFolderListItem } from "@telegram-system/shared";
import { Tooltip } from "@/components/ui/primitives";
import { formatCompactMoney } from "@/lib/features/finance/money";

type Channel = MutualPromotionFolderListItem["channels"][number];
type KpiTone = "target" | "ok" | "stop" | "unknown";

export function MutualPromotionPaidSubscriberPrice({
  channel,
}: {
  channel: Channel;
}) {
  const price = channel.stats.subscriberPrice;
  if (channel.role !== "PAID" || price == null) return <>—</>;

  const displayPrice = formatCompactMoney(price, channel.stats.currency);
  const tone = paidSubscriberKpiTone(channel);
  const toneClass = {
    target: "text-emerald-300",
    ok: "text-yellow-300",
    stop: "text-rose-300",
    unknown: "text-neutral-300",
  }[tone];

  return (
    <Tooltip
      content={<PaidSubscriberKpiTooltip channel={channel} tone={tone} />}
    >
      <button
        type="button"
        className={`cursor-help truncate font-semibold tabular-nums underline decoration-dotted underline-offset-2 ${toneClass}`}
        aria-label={`${displayPrice}. Paid subscriber KPI: ${kpiToneLabel(tone)}`}
      >
        {displayPrice}
      </button>
    </Tooltip>
  );
}

function PaidSubscriberKpiTooltip({
  channel,
  tone,
}: {
  channel: Channel;
  tone: KpiTone;
}) {
  const { kpi } = channel;
  const target = rangeLabel(kpi.targetFrom, kpi.targetTo, kpi.currency, "to");
  const acceptable = rangeLabel(
    kpi.acceptableFrom ?? kpi.targetTo,
    kpi.acceptableTo ?? kpi.stopFrom,
    kpi.currency,
  );
  const stop = rangeLabel(kpi.stopFrom, kpi.stopTo, kpi.currency, "from");

  return (
    <div className="w-72 space-y-2">
      <div className="font-semibold text-white">KPI ({kpi.currency})</div>
      <div className="flex flex-wrap gap-1.5">
        <KpiChip tone="target" label={`target ${target}`} />
        <KpiChip tone="ok" label={`ok ${acceptable}`} />
        <KpiChip tone="stop" label={`stop ${stop}`} />
      </div>
      <p className="text-neutral-400">
        Current result: <span className="text-white">{kpiToneLabel(tone)}</span>
      </p>
      {channel.stats.currency !== kpi.currency ? (
        <p className="text-amber-300">
          KPI highlighting requires the price and KPI to use the same currency.
        </p>
      ) : null}
    </div>
  );
}

function KpiChip({
  tone,
  label,
}: {
  tone: Exclude<KpiTone, "unknown">;
  label: string;
}) {
  const className = {
    target: "border-emerald-700 bg-emerald-950/50 text-emerald-200",
    ok: "border-yellow-700 bg-yellow-950/50 text-yellow-200",
    stop: "border-rose-700 bg-rose-950/50 text-rose-200",
  }[tone];
  return (
    <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>
  );
}

function paidSubscriberKpiTone(channel: Channel): KpiTone {
  const price = channel.stats.subscriberPrice;
  const { kpi } = channel;
  if (
    price == null ||
    channel.stats.currency !== kpi.currency ||
    !hasConfiguredKpi(channel)
  ) {
    return "unknown";
  }
  if (inRange(price, kpi.targetFrom, kpi.targetTo)) return "target";
  if (
    inRange(
      price,
      kpi.acceptableFrom ?? kpi.targetTo,
      kpi.acceptableTo ?? kpi.stopFrom,
      true,
    )
  ) {
    return "ok";
  }
  if (inRange(price, kpi.stopFrom, kpi.stopTo)) return "stop";
  return "unknown";
}

function hasConfiguredKpi(channel: Channel) {
  const { kpi } = channel;
  return [
    kpi.targetFrom,
    kpi.targetTo,
    kpi.acceptableFrom,
    kpi.acceptableTo,
    kpi.stopFrom,
    kpi.stopTo,
  ].some((value) => value != null);
}

function inRange(
  value: number,
  from: number | null,
  to: number | null,
  excludeEdges = false,
) {
  if (from == null && to == null) return false;
  if (from != null && (excludeEdges ? value <= from : value < from))
    return false;
  if (to != null && (excludeEdges ? value >= to : value > to)) return false;
  return true;
}

function rangeLabel(
  from: number | null,
  to: number | null,
  currency: string,
  oneSidedPrefix?: "to" | "from",
) {
  if (from != null && to != null) {
    return `${formatKpi(from)}–${formatKpi(to)} ${currency}`;
  }
  if (to != null)
    return `${oneSidedPrefix ?? "to"} ${formatKpi(to)} ${currency}`;
  if (from != null)
    return `${oneSidedPrefix ?? "from"} ${formatKpi(from)} ${currency}`;
  return "—";
}

function formatKpi(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function kpiToneLabel(tone: KpiTone) {
  return {
    target: "Target",
    ok: "OK",
    stop: "Stop",
    unknown: "Not evaluated",
  }[tone];
}
