"use client";

import { useMemo, useState } from "react";
import { CampaignAdmissionViewAnalyticsModal } from "@/components/features/growth/ad-campaigns/campaign-admission-view-analytics-modal";
import { CampaignInviteLinkHistoryModal } from "@/components/features/growth/ad-campaigns/campaign-invite-link-history-modal";
import { PromoPreviewModal } from "@/components/features/growth/ad-campaigns/promo-preview-modal";
import { displayCampaignTitleWithDate } from "./campaign-display-title";
import { useCampaignText } from "./use-campaign-text";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { InviteLinkPreviewModal } from "@/components/features/telegram/telegram/invite-link-preview-modal";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { TelegramInviteLinkCreatorAvatar as SharedInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import type { AdCampaign, AdCampaignInviteLinkRefreshProgress, Promo, TelegramChannel, TelegramInviteLink } from "@/lib/api";
import { AdCampaignRowActions } from "./ad-campaign-row-actions";
import { effectiveCampaignKpiStatus, campaignMetrics } from "./campaign-performance-metrics";
import { KpiTooltip, PerformanceCell } from "./campaign-performance-cell";

function InviteLinkCreatorAvatar({
  inviteLink,
}: {
  inviteLink: TelegramInviteLink;
}) {
  return (
    <SharedInviteLinkCreatorAvatar
      photoUrl={inviteLink.creatorPhotoUrl}
      memberAvatar={inviteLink.creatorMember?.avatarPresentation}
      label={inviteLinkCreatorFallback(inviteLink)}
    />
  );
}
function hypothesisStatusClass(status?: string) {
  if (status === "winner") return "border-emerald-700 text-emerald-200";
  if (status === "loser") return "border-rose-700 text-rose-200";
  if (status === "paused") return "border-yellow-700 text-yellow-200";
  if (status === "archived") return "border-slate-700 text-slate-400";
  return "border-blue-700 text-blue-200";
}

function PromoVisual({ promo }: { promo: Promo }) {
  return (
    <IconAvatar
      icon={promo.iconPresentation}
      label={promo.title}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  );
}

function SourceChip({
  source,
  fallback,
  compact = false,
  href,
  title,
}: {
  source: any;
  fallback?: string;
  compact?: boolean;
  href?: string;
  title?: string;
}) {
  const label = source?.title || source?.name || fallback || "-";
  const content = (
    <>
      {source?.avatarPresentation ? (
        <IconAvatar icon={source.avatarPresentation} label={label} size="xs" bordered={false} />
      ) : source?.photoUrl || source?.imageUrl ? (
        <img
          src={source.photoUrl || source.imageUrl}
          alt=""
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}
        >
          {String(label).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span
        className={`inline-flex items-center gap-2 ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
        title={title}
      >
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`inline-flex items-center gap-2 transition-colors hover:text-white ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
    >
      {content}
    </a>
  );
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
function PromoList({
  promos,
  inline = false,
  onOpenPromo,
}: {
  promos: Promo[];
  inline?: boolean;
  onOpenPromo?: (promo: Promo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewPromo, setPreviewPromo] = useState<Promo | null>(null);
  if (!promos.length) return null;
  const visible = expanded ? promos : promos.slice(0, 3);
  const hiddenCount = Math.max(0, promos.length - visible.length);
  const content = (
    <>
      {visible.map((promo) => (
        <button
          key={promo.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || !onOpenPromo) {
              if (event.metaKey || event.ctrlKey) {
                window.open(
                  `/ad-campaigns?section=promo&promoId=${promo.id}`,
                  "_blank",
                  "noopener,noreferrer",
                );
                return;
              }
              setPreviewPromo(promo);
              return;
            }
            onOpenPromo(promo);
          }}
          title={`Promo: ${promo.title}\nClick to open its preview modal.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-100 transition-colors hover:bg-blue-950/50"
        >
          <PromoVisual promo={promo} />
          <span className="truncate">{promo.title}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more promos`}
        >
          +{hiddenCount}
        </button>
      ) : null}
      <PromoPreviewModal
        promo={previewPromo}
        onClose={() => setPreviewPromo(null)}
      />
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function InviteLinkList({
  inviteLinks,
  inline = false,
}: {
  inviteLinks: TelegramInviteLink[];
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(
    null,
  );

  if (!inviteLinks.length) return null;
  const visible = expanded ? inviteLinks : inviteLinks.slice(0, 3);
  const hiddenCount = Math.max(0, inviteLinks.length - visible.length);

  const content = (
    <>
      {visible.map((inviteLink) => (
        <button
          key={inviteLink.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) {
              window.open(inviteLink.url, "_blank", "noopener,noreferrer");
              return;
            }
            setPreviewLink(inviteLink);
          }}
          title={`Invite link: ${inviteLink.name}\nClick to open preview modal.\nCtrl/Cmd + click opens the invite link in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-amber-800 bg-amber-950/20 px-2 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-950/35"
        >
          <InviteLinkCreatorAvatar inviteLink={inviteLink} />
          <span className="truncate">{inviteLink.name}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more invite links`}
        >
          +{hiddenCount}
        </button>
      ) : null}
      <InviteLinkPreviewModal
        inviteLink={previewLink}
        onClose={() => setPreviewLink(null)}
      />
    </>
  );

  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function SourceList({ sources }: { sources: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;
  const visible = expanded ? sources : sources.slice(0, 3);
  const hiddenCount = Math.max(0, sources.length - visible.length);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((source) => (
        <a
          key={source.selectionId || source.id}
          href={
            source.selectionId?.startsWith("source:")
              ? "/advertising-channels"
              : source.id
                ? `/telegram/channels/${source.id}`
                : "/advertising-channels"
          }
          title={`${source.selectionId?.startsWith("source:") ? "Advertising source" : "Telegram channel source"}: ${source.title || source.name}\nClick to open it.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-800 transition-colors hover:bg-slate-800"
        >
          {source.photoUrl || source.imageUrl ? (
            <img
              src={source.photoUrl || source.imageUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : null}
          <span className="truncate">{source.title || source.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more sources`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function HypothesisLinks({ links }: { links: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!links.length) return <span className="text-slate-500">-</span>;
  const visible = expanded ? links : links.slice(0, 2);
  const hiddenCount = Math.max(0, links.length - visible.length);
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {visible.map((link) => (
        <span
          key={link.hypothesis.id}
          className={`inline-flex min-w-0 max-w-full rounded-full border px-2 py-0.5 text-xs ${hypothesisStatusClass(link.hypothesis.status)}`}
        >
          <span className="truncate">{link.hypothesis.name}</span>
        </span>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more hypotheses`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

export function AdCampaignsTable({
  campaigns,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onToggleExclude,
  onOpenPromo,
  onRefreshInviteLinks,
  refreshingInviteLinkCampaignId,
  inviteLinkRefreshProgress,
  showActions = true,
  showHypotheses = true,
}: {
  campaigns: AdCampaign[];
  moneySettings: any;
  rates: any[] | undefined;
  onEdit?: (campaign: AdCampaign) => void;
  onDelete?: (campaign: AdCampaign) => void;
  onToggleExclude?: (
    campaign: AdCampaign,
    excludeFromAnalytics: boolean,
  ) => void;
  onOpenPromo?: (promo: Promo) => void;
  onRefreshInviteLinks?: (campaign: AdCampaign) => void;
  refreshingInviteLinkCampaignId?: string | null;
  inviteLinkRefreshProgress?: {
    campaignId: string;
    current: number;
    total: number;
    item: AdCampaignInviteLinkRefreshProgress;
  } | null;
  showActions?: boolean;
  showHypotheses?: boolean;
}) {
  const t = useCampaignText();
  const [kpiTooltip, setKpiTooltip] = useState<{
    channel: TelegramChannel;
    left: number;
    top: number;
  } | null>(null);
  const [historyCampaign, setHistoryCampaign] = useState<AdCampaign | null>(
    null,
  );
  const [admissionAnalyticsCampaign, setAdmissionAnalyticsCampaign] =
    useState<AdCampaign | null>(null);

  const normalizedCampaigns = useMemo(
    () =>
      campaigns.map((campaign) => {
        const hasWindows = Boolean(campaign.inviteLinkWindows?.length);
        const inviteLinkJoined = Number(campaign.inviteLinks?.reduce(
            (sum, link) => sum + Number(link.joinedCount ?? 0),
            0,
          ) ?? 0,
        );
        const inviteLinkAttributed = Number(campaign.inviteLinks?.reduce(
            (sum, link) =>
              sum +
              Number(link.joinedCount ?? 0) +
              Number(link.requestedCount ?? 0),
            0,
          ) ?? 0,
        );
        const joined =
          !hasWindows && inviteLinkJoined > 0
            ? inviteLinkJoined
            : Number(
                campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0,
              );
        const pending =
          !hasWindows && inviteLinkAttributed > 0
            ? Math.max(0, inviteLinkAttributed - inviteLinkJoined)
            : Number(campaign.analytics?.requestedCount ?? 0);
        const attributed =
          !hasWindows && inviteLinkAttributed > 0
            ? inviteLinkAttributed
            : Number(campaign.analytics?.attributedCount ?? joined + pending);
        const net =
          campaign.analytics?.netGrowth ?? campaign.netGrowthCount ?? joined;
        const left = campaign.analytics?.leftCount ?? campaign.leftCount ?? 0;
        const cost = Number(campaign.price || campaign.costAmount || 0);
        const primaryCost = Number(campaign.priceInPrimaryCurrency ?? 0);
        const costPerJoined = attributed > 0 ? cost / attributed : null;
        const primaryCostPerJoined =
          attributed > 0 ? primaryCost / attributed : null;
        const metrics = campaignMetrics(campaign);
        const kpiStatus = effectiveCampaignKpiStatus(
          campaign,
          costPerJoined,
          rates,
        );
        return {
          campaign,
          joined,
          pending,
          attributed,
          net,
          left,
          cost,
          primaryCost,
          costPerJoined,
          primaryCostPerJoined,
          metrics,
          kpiStatus,
        };
      }),
    [campaigns, rates],
  );

  const showKpiTooltip = (
    channel: TelegramChannel | undefined,
    element: HTMLElement,
  ) => {
    if (!channel) return;
    const rect = element.getBoundingClientRect();
    const width = 430;
    const left = Math.min(
      Math.max(16, rect.left),
      Math.max(16, window.innerWidth - width - 16),
    );
    const top = Math.min(
      rect.bottom + 10,
      Math.max(16, window.innerHeight - 96),
    );
    setKpiTooltip({ channel, left, top });
  };

  return (
    <>
      <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[350px]" />
            <col className="w-[450px]" />
            {showHypotheses ? <col className="w-[180px]" /> : null}
            {showActions ? <col className="w-[140px]" /> : null}
          </colgroup>
          <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">{t("Campaign")}</th>
              <th className="px-4 py-3 font-medium">{t("Performance")}</th>
              {showHypotheses ? (
                <th className="px-4 py-3 font-medium">{t("Hypotheses")}</th>
              ) : null}
              {showActions ? (
                <th className="px-4 py-3 text-right font-medium">{t("Actions")}</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {normalizedCampaigns.map((row, index) => (
              <tr
                key={row.campaign.id}
                id={`campaign-${row.campaign.id}`}
                className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? "bg-neutral-950" : "bg-black"}`}
              >
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-3">
                    <div className="truncate font-semibold text-white">
                      {displayCampaignTitleWithDate(row.campaign)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <SourceChip
                        source={row.campaign.telegramChannel}
                        fallback="-"
                        compact
                        href={
                          row.campaign.telegramChannel?.id
                            ? `/telegram/channels/${row.campaign.telegramChannel.id}`
                            : undefined
                        }
                        title={
                          row.campaign.telegramChannel?.title
                            ? `Own Telegram channel: ${row.campaign.telegramChannel.title}\nClick to open this channel.\nCtrl/Cmd + click opens it in a new tab.`
                            : undefined
                        }
                      />
                      {row.campaign.assignedMember ? (
                        <MemberChip member={row.campaign.assignedMember} />
                      ) : null}
                    </div>
                    <div className="flex max-w-full flex-wrap items-center gap-1.5">
                      <PromoList
                        promos={
                          row.campaign.promos ||
                          (row.campaign.promo ? [row.campaign.promo] : [])
                        }
                        onOpenPromo={onOpenPromo}
                        inline
                      />
                      <InviteLinkList
                        inviteLinks={row.campaign.inviteLinks || []}
                        inline
                      />
                    </div>
                    <SourceList
                      sources={row.campaign.advertisingChannels || []}
                    />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <PerformanceCell
                    campaign={row.campaign}
                    cost={row.cost}
                    currency={row.campaign.currency}
                    primaryCost={row.primaryCost}
                    costPerJoined={row.costPerJoined}
                    primaryCostPerJoined={row.primaryCostPerJoined}
                    joined={row.joined}
                    pending={row.pending}
                    attributed={row.attributed}
                    left={row.left}
                    moneySettings={moneySettings}
                    kpiStatus={row.kpiStatus}
                    metrics={row.metrics}
                    onShowKpiTooltip={showKpiTooltip}
                    onHideKpiTooltip={() => setKpiTooltip(null)}
                    onOpenHistory={() => setHistoryCampaign(row.campaign)}
                    onOpenAdmissionAnalytics={() =>
                      setAdmissionAnalyticsCampaign(row.campaign)
                    }
                  />
                </td>
                {showHypotheses ? (
                  <td className="px-4 py-4">
                    <HypothesisLinks
                      links={row.campaign.hypothesisLinks || []}
                    />
                  </td>
                ) : null}
                {showActions ? (
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-end gap-1">
                      {inviteLinkRefreshProgress?.campaignId ===
                      row.campaign.id ? (
                        <span
                          aria-live="polite"
                          className={`max-w-32 text-right text-[11px] ${inviteLinkRefreshProgress.item.status === "failed" ? "text-amber-300" : "text-sky-300"}`}
                        >
                          {inviteLinkRefreshProgress.current}/
                          {inviteLinkRefreshProgress.total}: {" "}
                          {inviteLinkRefreshProgress.item.status === "failed"
                            ? "failed"
                            : "updated"}
                        </span>
                      ) : null}
                      <AdCampaignRowActions
                        campaign={row.campaign}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onToggleExclude={onToggleExclude}
                        onOpenHistory={() => setHistoryCampaign(row.campaign)}
                        onRefreshInviteLinks={onRefreshInviteLinks}
                        refreshingInviteLinks={
                          refreshingInviteLinkCampaignId === row.campaign.id
                        }
                        refreshInviteLinksProgress={
                          inviteLinkRefreshProgress?.campaignId ===
                          row.campaign.id
                            ? inviteLinkRefreshProgress
                            : null
                        }
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kpiTooltip ? (
        <KpiTooltip
          channel={kpiTooltip.channel}
          left={kpiTooltip.left}
          top={kpiTooltip.top}
        />
      ) : null}
      <CampaignInviteLinkHistoryModal
        campaign={historyCampaign}
        onClose={() => setHistoryCampaign(null)}
      />
      <CampaignAdmissionViewAnalyticsModal
        campaign={admissionAnalyticsCampaign}
        onClose={() => setAdmissionAnalyticsCampaign(null)}
      />
    </>
  );
}
