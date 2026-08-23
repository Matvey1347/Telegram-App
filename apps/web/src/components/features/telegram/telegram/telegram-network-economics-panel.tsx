import { Eye, Megaphone, Percent } from "lucide-react";
import type { TelegramChannelNetworkSummary } from "@/lib/api";
import { NativeMoney } from "@/components/ui/native-money";
import { EntityCard } from "@/components/ui/primitives";

function number(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function TelegramNetworkEconomicsPanel({
  summary,
}: {
  summary: TelegramChannelNetworkSummary;
}) {
  const economics = summary.assetEconomics;
  if (!economics) return null;
  const currency = economics.currency || summary.currency;
  const pricing = economics.formatPricing;

  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-4">
        <EntityCard title="Invested" actions={null}>
          <p className="text-2xl font-semibold text-rose-300">
            <NativeMoney amount={economics.invested} currency={currency} />
          </p>
        </EntityCard>
        <EntityCard title="Earned" actions={null}>
          <p className="text-2xl font-semibold text-emerald-300">
            <NativeMoney amount={economics.revenue} currency={currency} />
          </p>
        </EntityCard>
        <EntityCard title="Payback" actions={null}>
          <p className="flex items-center gap-2 text-2xl font-semibold">
            <Percent size={19} className="text-teal-300" aria-hidden="true" />
            {economics.paybackPercent == null
              ? "-"
              : `${number(economics.paybackPercent, 1)}%`}
          </p>
        </EntityCard>
        <EntityCard title="Ads to break even" actions={null}>
          <p className="flex items-center gap-2 text-2xl font-semibold">
            <Megaphone
              size={19}
              className="text-amber-300"
              aria-hidden="true"
            />
            {number(economics.estimatedAdsRemaining)}
          </p>
        </EntityCard>
      </div>

      {pricing ? (
        <EntityCard title="Combined advertising prices" actions={null}>
          <p className="mb-3 text-sm text-slate-400">
            CPM <NativeMoney amount={pricing.cpm} currency={pricing.currency} />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["1/24", pricing.h24],
              ["2/48", pricing.h48],
              ["No delete", pricing.permanent],
            ].map(([label, item]) => {
              const window = item as typeof pricing.h24;
              return (
                <div
                  key={String(label)}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                >
                  <p className="font-medium text-slate-200">{String(label)}</p>
                  <p className="mt-1 font-semibold text-white">
                    <NativeMoney
                      amount={window.estimatedPrice}
                      currency={pricing.currency}
                    />
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                    <Eye
                      size={14}
                      className="text-sky-300"
                      aria-hidden="true"
                    />
                    {number(window.expectedViews)} views
                  </p>
                </div>
              );
            })}
          </div>
        </EntityCard>
      ) : null}

      {economics.conversionUnavailable ? (
        <p className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-3 text-sm text-amber-200">
          Some channels use different or non-comparable currencies, so combined
          financial totals are unavailable.
        </p>
      ) : null}
    </section>
  );
}
