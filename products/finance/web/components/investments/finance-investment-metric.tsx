export function FinanceInvestmentMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "sky" | "emerald" | "violet" | "rose";
}) {
  const colors = {
    neutral: "border-neutral-700 bg-neutral-950/40 [&>p:last-child]:text-white",
    sky: "border-sky-900/70 bg-neutral-950/40 [&>p:last-child]:text-sky-200",
    emerald:
      "border-emerald-900/70 bg-neutral-950/40 [&>p:last-child]:text-emerald-200",
    violet:
      "border-violet-900/70 bg-neutral-950/40 [&>p:last-child]:text-violet-200",
    rose: "border-rose-900/70 bg-neutral-950/40 [&>p:last-child]:text-rose-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
