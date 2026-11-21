"use client";

import type { MouseEventHandler } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdCampaignsTable } from "@/components/features/growth/ad-campaigns/campaigns-table";
import { AdHypothesisAvatar } from "@/components/features/growth/ad-campaigns/ad-hypothesis-avatar";
import { AdHypothesisRowActions } from "@/components/features/growth/ad-campaigns/ad-hypothesis-row-actions";
import { InviteLinkHistoryPanel } from "@/components/features/telegram/telegram/invite-link-history-panel";
import { InviteLinkPreviewModal } from "@/components/features/telegram/telegram/invite-link-preview-modal";
import {
  adHypothesesApi,
  type AdCampaign,
  type AdCampaignKpiStatus,
  type AdHypothesis,
  type TelegramInviteLink,
} from "@/lib/api";
import { MoneyStack } from "@/components/ui/money-stack";
import { EmptyState, LoadingState, Modal } from "@/components/ui/primitives";
import { NativeMoney } from "@/components/ui/native-money";
import {
  formatMetric,
  campaignPendingCount,
  campaignAttributedCount,
  displayCampaignTitleWithDate,
} from "./ads-workspace-campaign-summary";
import { SourceChip } from "./ads-workspace-source-chip";

function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "text-emerald-300";
  if (status === "acceptable") return "text-yellow-200";
  if (status === "bad") return "text-rose-200";
  return "text-white";
}

function performanceCardClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "border-emerald-700/70 bg-emerald-950/20";
  if (status === "acceptable") return "border-yellow-700/70 bg-yellow-950/20";
  if (status === "bad") return "border-rose-700/70 bg-rose-950/20";
  return "border-slate-800 bg-slate-950/40";
}
function MemberChip({
  member,
}: {
  member: NonNullable<AdCampaign["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl =
    member.avatarPresentation?.type === "image"
      ? member.avatarPresentation.url
      : undefined;
  const avatarEmoji =
    member.avatarPresentation?.type === "unicode"
      ? member.avatarPresentation.value
      : undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}
function kpiStatusClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good")
    return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "acceptable")
    return "border-yellow-700 bg-yellow-950/20 text-yellow-200";
  if (status === "bad") return "border-rose-700 bg-rose-950/20 text-rose-200";
  return "border-slate-700 bg-slate-950/30 text-slate-300";
}

function kpiStatusLabel(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "KPI hit";
  if (status === "acceptable") return "KPI ok";
  if (status === "bad") return "KPI missed";
  return "KPI unknown";
}

function kpiStatusTitle(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "CPA is inside target KPI range.";
  if (status === "acceptable") return "CPA is inside acceptable KPI range.";
  if (status === "bad") return "CPA is inside stop KPI range.";
  return "KPI range or enough CPA data is missing.";
}

function KpiStatusBadge({
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  status?: AdCampaignKpiStatus | null;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
}) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiStatusClass(status)} ${status && status !== "unknown" && onMouseEnter ? "cursor-help" : ""}`}
      title={kpiStatusTitle(status)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {kpiStatusLabel(status)}
    </span>
  );
}
export function HypothesesSection({
  hypotheses,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onOpenCampaigns,
  onOpenHistory,
  onToggleExclude,
}: {
  hypotheses: AdHypothesis[];
  loading: boolean;
  error: unknown;
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (hypothesis: AdHypothesis) => void;
  onDelete: (hypothesis: AdHypothesis) => void;
  onOpenCampaigns: (hypothesis: AdHypothesis) => void;
  onOpenHistory: (hypothesis: AdHypothesis) => void;
  onToggleExclude: (
    hypothesis: AdHypothesis,
    excludeFromAnalytics: boolean,
  ) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypotheses.
        </div>
      ) : null}
      {!loading && !error && !hypotheses.length ? (
        <EmptyState text="No hypotheses yet." />
      ) : null}
      {hypotheses.length ? (
        <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
          <table className="w-full min-w-[880px] table-fixed text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
              <tr>
                <th className="w-[52%] px-4 py-3 font-medium">Hypothesis</th>
                <th className="w-[38%] px-4 py-3 font-medium">Performance</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {hypotheses.map((hypothesis, index) => (
                <tr
                  key={hypothesis.id}
                  className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? "bg-neutral-950" : "bg-black"}`}
                >
                  <td className="px-4 py-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <AdHypothesisAvatar hypothesis={hypothesis} />
                        <div className="min-w-0">
                          <p className="font-semibold text-white">
                            {hypothesis.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {hypothesis.isSystem ? (
                              <span className="rounded-full border border-cyan-700/80 bg-cyan-950/40 px-2 py-0.5 text-xs font-medium text-cyan-200">
                                System
                              </span>
                            ) : null}
                            {hypothesis.assignedMember ? (
                              <MemberChip member={hypothesis.assignedMember} />
                            ) : null}
                            {hypothesis.telegramChannel ? (
                              <SourceChip
                                source={hypothesis.telegramChannel}
                                compact
                              />
                            ) : null}
                            {hypothesis.isSystem ? (
                              <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                                Campaigns{" "}
                                {formatMetric(
                                  hypothesis.summary?.campaignsCount ??
                                    hypothesis.campaignsCount,
                                )}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenCampaigns(hypothesis)}
                                className="inline-flex items-center rounded-full border border-blue-700 px-2 py-0.5 text-xs text-blue-200 transition-colors hover:border-blue-500 hover:text-white"
                              >
                                Campaigns{" "}
                                {formatMetric(
                                  hypothesis.summary?.campaignsCount ??
                                    hypothesis.campaignsCount,
                                )}
                              </button>
                            )}
                          </div>
                          {hypothesis.description ? (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                              {hypothesis.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div
                      className={`rounded-xl border p-3 ${performanceCardClass(hypothesis.summary?.kpiStatus)}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <KpiStatusBadge
                          status={hypothesis.summary?.kpiStatus}
                        />
                      </div>
                      <div className="grid grid-cols-[minmax(90px,1fr)_minmax(80px,0.75fr)_minmax(80px,0.85fr)] gap-3">
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            Spend
                          </p>
                          <NativeMoney
                            amount={
                              hypothesis.summary?.totalSpendDisplay ??
                              hypothesis.summary?.totalSpend
                            }
                            currency={
                              hypothesis.summary?.displayCurrency ??
                              moneySettings.primaryCurrency
                            }
                            displayMode={moneySettings.currencyDisplayMode}
                            className="font-semibold leading-snug text-white"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            Attributed
                          </p>
                          <p
                            className={`font-semibold leading-snug ${kpiMetricTextClass(hypothesis.summary?.kpiStatus)}`}
                          >
                            {formatMetric(
                              hypothesis.summary?.totalAttributedSubscribers,
                            )}
                          </p>
                          <div className="mt-1 space-y-0.5 text-xs leading-snug text-slate-500">
                            <p>
                              Joined{" "}
                              {formatMetric(
                                hypothesis.summary?.totalJoinedSubscribers,
                              )}
                            </p>
                            {Number(
                              hypothesis.summary?.totalPendingSubscribers ?? 0,
                            ) > 0 ? (
                              <p>
                                Pending{" "}
                                {formatMetric(
                                  hypothesis.summary?.totalPendingSubscribers,
                                )}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            CPA
                          </p>
                          <NativeMoney
                            amount={
                              hypothesis.summary?.avgCpaDisplay ??
                              hypothesis.summary?.avgCpa
                            }
                            currency={
                              hypothesis.summary?.displayCurrency ??
                              moneySettings.primaryCurrency
                            }
                            displayMode={moneySettings.currencyDisplayMode}
                            className={`font-semibold leading-snug ${kpiMetricTextClass(hypothesis.summary?.kpiStatus)}`}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <AdHypothesisRowActions
                        hypothesis={hypothesis}
                        onOpenHistory={onOpenHistory}
                        onEdit={onEdit}
                        onToggleExclude={onToggleExclude}
                        onDelete={onDelete}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export function HypothesisCampaignsModal({
  hypothesis,
  moneySettings,
  rates,
  onClose,
}: {
  hypothesis: AdHypothesis | null;
  moneySettings: any;
  rates: any[] | undefined;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["ad-hypothesis-detail", hypothesis?.id],
    queryFn: () => adHypothesesApi.get(hypothesis!.id),
    enabled: Boolean(hypothesis?.id),
  });

  return (
    <Modal
      open={Boolean(hypothesis)}
      onClose={onClose}
      title={
        hypothesis ? `${hypothesis.name} campaigns` : "Hypothesis campaigns"
      }
      size="xl"
    >
      {detailQuery.isLoading ? <LoadingState /> : null}
      {detailQuery.error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypothesis campaigns.
        </div>
      ) : null}
      {detailQuery.data?.campaigns?.length ? (
        <AdCampaignsTable
          campaigns={detailQuery.data.campaigns}
          moneySettings={moneySettings}
          rates={rates}
          showActions={false}
          showHypotheses={false}
        />
      ) : null}
      {!detailQuery.isLoading &&
      !detailQuery.error &&
      !detailQuery.data?.campaigns?.length ? (
        <EmptyState text="No campaigns in this hypothesis." />
      ) : null}
    </Modal>
  );
}

export function HypothesisInviteLinkHistoryModal({
  hypothesis,
  onClose,
}: {
  hypothesis: AdHypothesis | null;
  onClose: () => void;
}) {
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(
    null,
  );
  const historyQuery = useQuery({
    queryKey: ["ad-hypothesis-history", hypothesis?.id],
    queryFn: () => adHypothesesApi.inviteLinkHistory(hypothesis!.id),
    enabled: Boolean(hypothesis?.id),
  });
  const history = historyQuery.data;

  return (
    <Modal
      open={Boolean(hypothesis)}
      onClose={onClose}
      title={hypothesis ? `${hypothesis.name} trend` : "Hypothesis trend"}
      size="xl"
    >
      {historyQuery.isLoading ? <LoadingState /> : null}
      {historyQuery.error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypothesis trend.
        </div>
      ) : null}
      {history ? (
        <div className="space-y-4">
          <InviteLinkHistoryPanel
            title="Hypothesis invite-link trend"
            subtitle="Aggregate joined and pending requests across all linked campaigns after each sync."
            points={history.points}
            summary={history.summary}
          />
          <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Invite links breakdown
              </h3>
              <span className="text-xs text-slate-500">
                {formatMetric(history.summary.campaignsCount)} campaigns ·{" "}
                {formatMetric(history.summary.inviteLinksCount)} links
              </span>
            </div>
            <div className="space-y-2">
              {history.inviteLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setPreviewLink(link as TelegramInviteLink)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-950/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {link.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <p>
                        current {formatMetric(link.summary.currentJoinedCount)}{" "}
                        / peak {formatMetric(link.summary.peakJoinedCount)}
                      </p>
                      <p>
                        pending{" "}
                        {formatMetric(link.summary.currentRequestedCount)}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200">
                    drop {formatMetric(link.summary.drawdownPercent, 1)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
          <InviteLinkPreviewModal
            inviteLink={previewLink}
            onClose={() => setPreviewLink(null)}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export function CampaignSelectRow({
  campaign,
  checked,
  moneySettings,
  rates,
  onToggle,
}: {
  campaign: AdCampaign;
  checked: boolean;
  moneySettings: any;
  rates: any[] | undefined;
  onToggle: () => void;
}) {
  const joined = campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
  const pending = campaignPendingCount(campaign);
  const attributed = campaignAttributedCount(campaign);
  const price = Number(campaign.price ?? campaign.costAmount ?? 0);
  const primaryPrice = Number(campaign.priceInPrimaryCurrency ?? 0);
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${checked ? "border-blue-700 bg-slate-900" : "border-slate-800 bg-slate-900/30 hover:border-slate-700"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">
          {displayCampaignTitleWithDate(campaign)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {campaign.telegramChannel ? (
            <SourceChip source={campaign.telegramChannel} compact />
          ) : null}
          {campaign.assignedMember ? (
            <MemberChip member={campaign.assignedMember} />
          ) : null}
        </div>
        <MoneyStack
          amount={price}
          currency={campaign.currency}
          settings={moneySettings}
          rates={rates}
          amountInPrimary={primaryPrice}
          mainClassName="mt-2 truncate text-xs text-slate-300"
          subClassName="text-xs text-slate-500"
        />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>Attributed {formatMetric(attributed)}</span>
          <span>Joined {formatMetric(joined)}</span>
          {pending > 0 ? <span>Pending {formatMetric(pending)}</span> : null}
        </div>
      </div>
    </label>
  );
}
