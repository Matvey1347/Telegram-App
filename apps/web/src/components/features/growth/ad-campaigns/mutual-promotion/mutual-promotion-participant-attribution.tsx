import { TrendingUp, UserMinus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type {
  MutualPromotionFolderParticipantStats,
  MutualPromotionParticipantRole,
} from "@telegram-system/shared";
import { formatMoney } from "@/lib/features/finance/money";

function Count({
  value,
  prefix = "",
}: {
  value: number | null;
  prefix?: string;
}) {
  return (
    <>
      {value == null
        ? "—"
        : `${prefix}${new Intl.NumberFormat().format(value)}`}
    </>
  );
}

export function MutualPromotionParticipantAttribution({
  role,
  stats,
}: {
  role: MutualPromotionParticipantRole;
  stats: MutualPromotionFolderParticipantStats;
}) {
  return (
    <dl
      className={`mt-2 grid grid-cols-2 gap-2 text-sm ${
        role === "PUBLISHER" ? "sm:grid-cols-4" : "sm:grid-cols-2"
      }`}
    >
      <AttributionMetric
        icon={<TrendingUp size={14} className="text-emerald-300" />}
        label="Folder (joined + requests)"
        value={<Count value={stats.acquiredCount} prefix="+" />}
        detail={
          role === "PAID"
            ? `${stats.subscriberPrice == null ? "—" : formatMoney(stats.subscriberPrice, stats.currency)} / attributed arrival`
            : undefined
        }
      />
      {role === "PUBLISHER" ? (
        <>
          <AttributionMetric
            icon={<UserMinus size={14} className="text-rose-300" />}
            label="Estimated unsubscribes ≈"
            value={<Count value={stats.unsubscribedCount} />}
          />
          <AttributionMetric
            icon={<UserRound size={14} className="text-violet-300" />}
            label="Net audience"
            value={<Count value={stats.audienceDelta} />}
          />
        </>
      ) : null}
    </dl>
  );
}

function AttributionMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-neutral-900/50 p-2">
      <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-medium tabular-nums text-white">{value}</dd>
      {detail ? (
        <span className="mt-1 block truncate text-[11px] text-neutral-500">
          {detail}
        </span>
      ) : null}
    </div>
  );
}
