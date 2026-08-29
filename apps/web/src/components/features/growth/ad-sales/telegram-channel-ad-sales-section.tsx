"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { MetricPreviewLabel } from "@/lib/metric-preview-icons";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { formatDateTime } from "@/lib/date-format";

function money(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const channelAdSalesPanelClass =
  "rounded-lg border border-slate-700 bg-slate-950/20 p-3";
const channelAdSalesTileClass =
  "min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2";

export function TelegramChannelAdSalesSection({
  channelId,
}: {
  channelId: string;
}) {
  const query = useQuery({
    queryKey: telegramAdSalesKeys.channelAnalytics(channelId, {
      rangeDays: 30,
    }),
    queryFn: () =>
      telegramAdSalesApi.channelAnalytics(channelId, {
        rangeDays: 30,
      }),
  });

  if (query.isLoading) return <LoadingState text="Loading ad-sales metrics…" />;
  if (query.error)
    return <ErrorState text="Could not load channel ad-sales analytics." />;
  if (!query.data)
    return <EmptyState text="No ad-sales analytics for this channel yet." />;

  const analytics = query.data;

  return (
    <section
      className={channelAdSalesPanelClass}
      data-testid="channel-ad-sales"
    >
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Ad sales</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Current pricing, revenue, and inventory snapshot
          </p>
        </div>
        <Link
          href={`/ad-sales/analytics?channelId=${encodeURIComponent(channelId)}`}
          className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:border-slate-600 hover:bg-slate-900/60 hover:text-blue-200"
        >
          Open full module
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(136px,100%),1fr))] gap-2">
        <SectionStat
          label="Recommended price"
          value={money(analytics.pricing.currentRecommendedPrice)}
        />
        <SectionStat
          label="Paid revenue"
          value={money(analytics.revenue.totalPaidRevenue)}
        />
        <SectionStat
          label="Placements"
          value={String(analytics.placements.sold)}
        />
        <SectionStat
          label="Fill rate"
          value={`${analytics.placements.slotFillRate}%`}
        />
        <SectionStat
          label="Actual CPM"
          value={money(analytics.performance.actualCpm)}
        />
        <SectionStat
          label="Underpricing"
          value={money(analytics.pricing.underpricingAmount)}
        />
        <SectionStat
          label="Upcoming"
          value={String(analytics.operations.upcomingPlacements)}
        />
        <SectionStat
          label="Free slots"
          value={String(analytics.placements.slotsAvailable)}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">
            Recent sales
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/20">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/45 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">Advertiser</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Agreed</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {analytics.recentSales.map((sale) => (
                  <tr key={sale.placementId}>
                    <td className="px-3 py-2 text-white">
                      {sale.advertiserName}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(sale.scheduledAt)}
                    </td>
                    <td className="px-3 py-2">
                      {money(sale.agreedPrice)} {sale.currency}
                    </td>
                    <td className="px-3 py-2">{sale.status}</td>
                  </tr>
                ))}
                {!analytics.recentSales.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-xs text-slate-500"
                    >
                      No recent sales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <div className={channelAdSalesTileClass}>
            <p className="text-xs text-slate-400">Expected vs actual views</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {analytics.performance.expectedViews.toLocaleString()} expected
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {analytics.performance.actualViewsFinal.toLocaleString()} actual
              final
            </p>
          </div>
          <div className={channelAdSalesTileClass}>
            <p className="text-xs text-slate-400">Outstanding revenue</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {money(analytics.revenue.outstandingRevenue)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={channelAdSalesTileClass}>
      <MetricPreviewLabel
        label={label}
        className="truncate text-xs text-slate-400"
      />
      <p className="mt-1 truncate text-sm font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}
