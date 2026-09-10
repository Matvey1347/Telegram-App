import { Megaphone, Percent } from "lucide-react";

export function ChannelPaybackStatus({
  paybackPercent,
  adsLeft,
  investmentRecovered = false,
  showEmpty = false,
  paybackMaximumFractionDigits = 1,
  className = "",
}: {
  paybackPercent?: number | null;
  adsLeft?: number | null;
  investmentRecovered?: boolean;
  showEmpty?: boolean;
  paybackMaximumFractionDigits?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 whitespace-nowrap text-xs ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <Percent size={14} className="text-teal-300" aria-hidden="true" />
        <span className="text-neutral-500">Payback</span>
        <strong className="font-semibold text-white">
          {paybackPercent == null
            ? "—"
            : `${formatCompactNumber(paybackPercent, paybackMaximumFractionDigits)}%`}
        </strong>
        {investmentRecovered ? (
          <span className="text-emerald-300">Investment recovered</span>
        ) : null}
      </span>
      {adsLeft != null || showEmpty ? (
        <span className="inline-flex items-center gap-1.5 text-neutral-400">
          <Megaphone size={14} className="text-amber-300" aria-hidden="true" />
          <strong className="font-semibold text-white">
            {adsLeft == null ? "—" : formatCompactNumber(adsLeft)}
          </strong>{" "}
          ads left
        </span>
      ) : null}
    </div>
  );
}

function formatCompactNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
  });
}
