import type { CrossPromotionPlan, CrossPromotionPlanKind, TelegramAdProduct } from "@telegram-system/shared";
import type { CrossPromotionPlacementSettingsValue } from "./cross-promotion-placement-settings";

export function crossPromotionPlacementProduct(
  productsByChannelId: Record<string, TelegramAdProduct[]>,
  channelId: string,
  formatId: string | undefined,
) {
  return productsByChannelId[channelId]?.find((product) => product.id === formatId);
}

function estimateViews(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return {
    count: values.length,
    covered: known.length,
    views: known.length ? known.reduce((total, value) => total + value, 0) : null,
  };
}

function Estimate({ label, result }: { label: string; result: ReturnType<typeof estimateViews> }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-sm">
      <div className="flex justify-between gap-2">
        <dt>{label}</dt>
        <dd className="tabular-nums text-white">{result.count}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-neutral-400">
        <dt>Estimated views</dt>
        <dd className="tabular-nums">{result.views === null ? "—" : `≈ ${result.views.toLocaleString()}`}</dd>
      </div>
      {result.covered > 0 && result.covered < result.count ? (
        <dd className="text-xs text-neutral-500">{result.covered} of {result.count} placements estimated</dd>
      ) : null}
    </div>
  );
}

export function CrossPromotionPlanSummary({
  kind,
  publisherIds,
  publisherSettings,
  additionalPublisherPosts,
  partnerIds,
  partnerSettings,
  productsByChannelId,
  initial,
}: {
  kind: CrossPromotionPlanKind;
  publisherIds: string[];
  publisherSettings: CrossPromotionPlacementSettingsValue;
  additionalPublisherPosts: { settings: CrossPromotionPlacementSettingsValue }[];
  partnerIds: string[];
  partnerSettings: CrossPromotionPlacementSettingsValue;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  initial: CrossPromotionPlan | null;
}) {
  const direct = kind === "DIRECT_MUTUAL";
  const prices = (ids: string[], settings: CrossPromotionPlacementSettingsValue) =>
    ids.map((id) => crossPromotionPlacementProduct(productsByChannelId, id, settings.formatIds[id])?.estimatedViews);
  const ours = estimateViews([
    ...prices(publisherIds, publisherSettings),
    ...(direct ? additionalPublisherPosts.flatMap(({ settings }) => prices(publisherIds, settings)) : []),
  ]);
  const partner = estimateViews(direct ? prices(partnerIds, partnerSettings) : []);
  const publishedViews = estimateViews(initial?.publisherResults.map(({ postViews }) => postViews) ?? []);
  const measuredTarget = initial?.targetResults.length === 1 ? initial.targetResults[0] : undefined;
  const measuredConversion = !direct && measuredTarget && initial?.status === "COMPLETED" &&
    publishedViews.views !== null && publishedViews.views > 0 && publishedViews.covered === publishedViews.count
    ? measuredTarget.joinedCount / publishedViews.views
    : null;

  return (
    <aside aria-label="VP summary" className="hidden min-w-0 space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 lg:sticky lg:top-0 lg:block">
      <div>
        <h3 className="font-semibold text-white">VP summary</h3>
        <p className="mt-1 text-xs text-neutral-400">{direct ? "Mutual promotion" : "Own-channel promotion"}</p>
      </div>
      <dl className="space-y-2 text-neutral-300">
        <Estimate label="My placements" result={ours} />
        {direct ? <Estimate label="Partner placements" result={partner} /> : null}
        {measuredConversion !== null && measuredTarget ? (
          <div className="space-y-1 rounded-lg border border-neutral-800 p-3 text-xs text-neutral-400">
            <div className="flex justify-between gap-2"><dt>Actual views</dt><dd>{publishedViews.views?.toLocaleString()}</dd></div>
            <div className="flex justify-between gap-2"><dt>Joined via invite</dt><dd>{measuredTarget.joinedCount.toLocaleString()}</dd></div>
            <div className="flex justify-between gap-2"><dt>Joins per view</dt><dd>{new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 }).format(measuredConversion)}</dd></div>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
