import { CreditCard, UsersRound, type LucideIcon } from "lucide-react";

export function BotAudienceMetrics({
  label,
  registered,
  active,
  paid,
}: {
  label: string;
  registered?: number;
  active?: number;
  paid?: { total?: number; active?: number };
}) {
  return (
    <div
      className={`grid gap-2 ${paid ? "grid-cols-2" : "grid-cols-1"}`}
      aria-label={label}
    >
      <AudienceMetric
        icon={UsersRound}
        label="Registered"
        total={registered}
        active={active}
      />
      {paid && (
        <AudienceMetric
          icon={CreditCard}
          label="Paid"
          total={paid.total}
          active={paid.active}
        />
      )}
    </div>
  );
}

function AudienceMetric({
  icon: Icon,
  label,
  total,
  active,
}: {
  icon: LucideIcon;
  label: string;
  total?: number;
  active?: number;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="flex items-center gap-2 text-sm text-neutral-400">
        <Icon size={16} aria-hidden="true" /> {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">
        {total?.toLocaleString() ?? "—"}
      </p>
      <p className="text-xs text-neutral-400">
        {active?.toLocaleString() ?? "—"} active in 30 days
      </p>
    </div>
  );
}
