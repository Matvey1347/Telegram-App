"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { MoneyStack } from "@/components/ui/money-stack";
import {
  Button,
  Card,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { adCampaignsApi, currenciesApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";

import {
  formatDateTime,
  formatNumber,
  dataQualityClass,
  statusClass,
  displayCampaignTitle,
  AnalyticsPanel,
  AdmissionViewAnalyticsPanel,
  InfoPill,
  AttributionPreview,
  InfoRow,
} from "./ad-campaign-detail-panels";

function errorMessage(error: unknown, fallback: string) {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(", ");
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function AdCampaignDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();

  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: currencyRates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
  });
  const {
    data: campaign,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ad-campaign", id],
    queryFn: () => adCampaignsApi.get(id),
  });
  const recalcMutation = useMutation({
    mutationFn: () => adCampaignsApi.recalculateAnalytics(id),
    onSuccess: (next) => {
      queryClient.setQueryData(["ad-campaign", id], next);
      queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      pushToast("Campaign analytics recalculated.", "success");
    },
    onError: (err) =>
      pushToast(errorMessage(err, "Failed to recalculate campaign."), "error"),
  });

  return (
    <AppShell>
      {campaign ? (
        <PageTabHead
          title={`Campaign · ${displayCampaignTitle(campaign)} · Telegram System`}
        />
      ) : null}
      <PageHeader
        title={campaign ? displayCampaignTitle(campaign) : "Ad Campaign"}
        subtitle={campaign?.telegramChannel?.title || "Campaign analytics"}
        action={
          <Link
            href="/ad-campaigns"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Back
          </Link>
        }
      />
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load campaign.
        </div>
      ) : null}
      {campaign ? (
        <div className="mx-auto max-w-6xl space-y-3">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs ${statusClass(campaign.overallStatus)}`}
                  >
                    {campaign.overallStatus || "unknown"}
                  </span>
                  {campaign.adDataQuality ? (
                    <span
                      className={`rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}
                    >
                      {campaign.adDataQuality}
                    </span>
                  ) : null}
                  {campaign.excludeFromAnalytics ? (
                    <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      Excluded
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300">
                  {campaign.decisionText || "Not enough data yet."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm md:w-[360px]">
                <InfoPill
                  label="Cost"
                  value={
                    <MoneyStack
                      amount={Number(campaign.price || 0)}
                      currency={campaign.currency}
                      settings={currencySettings}
                      rates={currencyRates}
                      amountInPrimary={campaign.priceInPrimaryCurrency}
                      mainClassName="font-semibold text-white"
                      subClassName="text-xs text-slate-500"
                    />
                  }
                />
              </div>
            </div>
          </Card>

          <AnalyticsPanel
            campaign={campaign}
            currency={currencySettings?.primaryCurrency || campaign.currency}
          />
          <AdmissionViewAnalyticsPanel campaign={campaign} />

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Attribution</h3>
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                    Own channel
                  </p>
                  <AttributionPreview
                    item={campaign.telegramChannel}
                    kind="channel"
                    fallback="-"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                    Advertising sources
                  </p>
                  <div className="grid gap-2">
                    {(campaign.advertisingChannels || []).length ? (
                      (campaign.advertisingChannels || []).map(
                        (source: any) => (
                          <AttributionPreview
                            key={source.selectionId || source.id}
                            item={source}
                            kind={
                              source.sourceKind === "person" ||
                              source.kind === "person"
                                ? "person"
                                : "channel"
                            }
                            fallback="Advertising source"
                          />
                        ),
                      )
                    ) : (
                      <p className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm text-slate-500">
                        No advertising sources
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <InfoRow
                    label="Promos"
                    value={
                      campaign.promos?.length
                        ? campaign.promos.map((promo) => promo.title).join(", ")
                        : campaign.promo?.title || "-"
                    }
                  />
                  <InfoRow
                    label="Invite links"
                    value={
                      campaign.inviteLinks?.length
                        ? campaign.inviteLinks
                            .map((inviteLink) => inviteLink.name)
                            .join(", ")
                        : (campaign as any).telegramInviteLink?.name ||
                          campaign.telegramInviteLinkId ||
                          "-"
                    }
                  />
                  <InfoRow
                    label="Attribution"
                    value={campaign.isMixedAttribution ? "Mixed" : "Clean"}
                  />
                </div>
              </div>
            </Card>
            <div className="space-y-3">
              <Card>
                <h3 className="mb-3 text-lg font-semibold">Data quality</h3>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">Quality</p>
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}
                    >
                      {campaign.adDataQuality || "normal"}
                    </span>
                  </div>
                  {campaign.adDataQualityReason ? (
                    <p className="mt-2 text-sm text-slate-300">
                      {campaign.adDataQualityReason}
                    </p>
                  ) : null}
                  {campaign.adDataQualityWarning ? (
                    <p className="mt-2 text-sm text-amber-100">
                      {campaign.adDataQualityWarning}
                    </p>
                  ) : null}
                </div>
              </Card>
              <Card>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Sync metadata</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={recalcMutation.isPending}
                    onClick={() => recalcMutation.mutate()}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCw size={16} />{" "}
                      {recalcMutation.isPending
                        ? "Recalculating..."
                        : "Recalculate"}
                    </span>
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <InfoRow
                    label="Calculated"
                    value={formatDateTime(campaign.analyticsLastCalculatedAt)}
                  />
                  <InfoRow
                    label="Auto synced"
                    value={formatDateTime(campaign.analyticsLastAutoSyncedAt)}
                  />
                  <InfoRow
                    label="Manual synced"
                    value={formatDateTime(campaign.analyticsLastManualSyncedAt)}
                  />
                  <InfoRow
                    label="Clicks after"
                    value={formatNumber(campaign.clicksAfter)}
                  />
                </div>
              </Card>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
