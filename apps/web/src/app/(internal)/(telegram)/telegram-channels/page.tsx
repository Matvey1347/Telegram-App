"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Cable,
  CircleHelp,
  Download,
  ImagePlus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { AppShell } from "@/components/layout/app-shell";
import { ChannelPreview } from "@/components/features/telegram/telegram/channel-preview";
import { ExternalChannelAdAnalysis } from "@/components/features/telegram/telegram/external-channel-ad-analysis";
import { ChannelAutoSyncToggle } from "@/components/features/telegram/telegram/channel-auto-sync-toggle";
import {
  ChannelEconomicsSummary,
  sortChannelsByScale,
} from "@/components/features/telegram/telegram/channel-economics-summary";
import {
  ChannelActionsMenu,
  ChannelMenuAction,
  ChannelMenuLink,
} from "@/components/features/telegram/telegram/channel-card-actions";
import { ChannelStatusBadges } from "@/components/features/telegram/telegram/channel-system-bot-access-modal";
import {
  ChannelSyncScopeModal,
  DEFAULT_CHANNEL_SYNC_SELECTION,
  WorkspaceChannelSyncModal,
  syncSelectionFromChannel,
} from "@/components/features/telegram/telegram/channel-sync-scope-modal";
import { telegramChannelAccessLabel } from "@/components/features/telegram/telegram/channel-access-badge";
import { MtprotoAccountsPanel } from "@/components/features/telegram/telegram/telegram-account-panels";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { TelegramSourceAvatar } from "@/components/features/telegram/telegram/telegram-source-avatar";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import {
  TelegramNetworkCards,
  TelegramPeopleCards,
} from "@/components/features/telegram/telegram/telegram-overview-cards";
import { IconPicker } from "@/components/icons/icon-picker";
import { MoneyStack } from "@/components/ui/money-stack";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { MemberSelect } from "@/components/features/workspace/member-select";
import {
  advertisingChannelsApi,
  currenciesApi,
  iconsApi,
  syncTelegramChannelNowWithProgress,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type AdvertisingChannel,
  type CurrencySettings,
  type ExchangeRate,
  type ImportedTelegramSource,
  type TelegramAnalyticsSources,
  type TelegramChannel,
  type TelegramChannelAdAnalysis,
  type TelegramChannelAdAnalysisPayload,
  type TelegramChannelAdAnalysisStatus,
  type TelegramChannelFinancialSummary,
  type TelegramChannelNetwork,
  type TelegramChannelSyncNowPayload,
  type TelegramChannelSyncSelection,
  type TelegramManagedPost,
  type TelegramChannelSourceAccess,
} from "@/lib/api";
import { scheduleProgressDismiss, syncProgressToToast } from "@/lib/progress";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import {
  Button,
  ConfirmDeleteModal,
  CurrencySelect,
  CustomSelect,
  DateInput,
  EmptyState,
  EntityCard,
  FormField,
  IconButton,
  Input,
  LoadingState,
  MasonryGrid,
  Modal,
  MultiSelect,
  PageHeader,
  Select,
  Textarea,
  TimeInput,
  TooltipBubble,
  isValidTimeInputValue,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import {
  dashboardKeys,
  networkKeys,
  telegramChannelKeys,
} from "@/lib/query-keys";
import {
  prependTelegramChannelToCaches,
  moveTelegramChannelBetweenLifecycleCaches,
  removeTelegramChannelFromCaches,
} from "@/lib/features/telegram/telegram-channel-cache";
import { invalidateTelegramChannelQueries } from "@/lib/features/telegram/telegram-query-invalidation";
import {
  parseTelegramAccountFilter as parseAccountFilter,
  parseTelegramChannelLifecycle as parseChannelLifecycleTab,
  parseTelegramChannelOwnership as parseChannelFilter,
  parseTelegramChannelsTab as parseTelegramTab,
  type TelegramAccountFilter as AccountFilter,
  type TelegramChannelLifecycleFilter as ChannelLifecycleTab,
  type TelegramChannelOwnershipFilter as ChannelFilter,
  type TelegramChannelsTab as TelegramTab,
} from "@/components/features/telegram/telegram/telegram-channels-route-state";
function normalizeUsername(value?: string | null) {
  return String(value || "")
    .replace(/^@/, "")
    .trim();
}

function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, decimals = 0) {
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatDataType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

function kpiBadgeClass(status?: TelegramChannelFinancialSummary["kpiStatus"]) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeParts(value?: string | Date | null) {
  if (!value) {
    return {
      date: "",
      time: "",
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function safeExportFileName(value: string) {
  return (
    value
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "telegram-channel"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isOwnChannel(channel: TelegramChannel) {
  return Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
}

function isPersonSource(
  source: ImportedTelegramSource,
): source is AdvertisingChannel {
  return "kind" in source && source.kind === "person";
}

function ChannelSourcesSummary({
  channelId,
  sourcesCount,
  compact = false,
  menuItem = false,
}: {
  channelId: string;
  sourcesCount: number;
  compact?: boolean;
  menuItem?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] =
    useState<TelegramChannelSourceAccess | null>(null);
  const {
    data: analyticsSources,
    isLoading: analyticsSourcesLoading,
    error: analyticsSourcesError,
  } = useQuery({
    queryKey: ["telegram-channel-analytics-sources", channelId],
    queryFn: () => telegramChannelsApi.analyticsSources(channelId),
    enabled: modalOpen,
  });
  return (
    <div className={compact ? "contents" : "mt-2 flex justify-end"}>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={
          menuItem
            ? "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
            : compact
              ? "group relative inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:border-blue-500 hover:bg-blue-950/30 hover:text-white"
              : "inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 transition hover:border-neutral-600 hover:text-blue-300"
        }
      >
        <Cable size={15} aria-hidden="true" />
        Sources <span className="text-neutral-500">{sourcesCount}</span>
        {compact ? (
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-950 px-2 py-1 text-xs text-white shadow group-hover:block">
            Channel sources
          </span>
        ) : null}
      </button>
      <ChannelSourcesModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSource(null);
        }}
        sources={analyticsSources?.sources || []}
        dataAttribution={analyticsSources?.dataAttribution || []}
        isLoading={analyticsSourcesLoading}
        error={analyticsSourcesError}
        onSelectSource={setSelectedSource}
      />
      <SourceAccessModal
        access={selectedSource}
        onClose={() => setSelectedSource(null)}
      />
    </div>
  );
}

function ChannelSourcesModal({
  open,
  onClose,
  sources,
  dataAttribution,
  isLoading,
  error,
  onSelectSource,
}: {
  open: boolean;
  onClose: () => void;
  sources: Array<TelegramChannelSourceAccess & { usedFor?: string[] }>;
  dataAttribution: TelegramAnalyticsSources["dataAttribution"];
  isLoading: boolean;
  error: unknown;
  onSelectSource: (source: TelegramChannelSourceAccess) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sync sources and scope">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            Connected sources
          </p>
          {isLoading ? <LoadingState /> : null}
          {!isLoading && !error && !sources.length ? (
            <EmptyState text="No synced source access for this channel yet." />
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {sources.map((source) => (
              <button
                key={`${source.sourceType}:${source.sourceId}`}
                type="button"
                onClick={() => onSelectSource(source)}
                className="flex min-h-36 flex-col rounded-md border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <TelegramSourceAvatar
                    avatarUrl={source.avatarUrl}
                    sourceType={source.sourceType}
                    alt={source.displayName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {source.displayName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <span>{source.sourceType}</span>
                      <span>·</span>
                      <AccessBadge
                        label={formatRole(source.role)}
                        tip={roleTooltip(source.role, source.sourceType)}
                      />
                    </p>
                  </div>
                </div>
                <div
                  className={`mt-2 flex min-h-11 flex-wrap items-center gap-1 text-xs ${source.canBeUsedForAnalytics ? "text-emerald-300" : "text-amber-300"}`}
                >
                  <span>
                    {source.canBeUsedForAnalytics
                      ? "Can be used for analytics"
                      : "Not enough access for analytics"}
                  </span>
                  <PermissionSummaryBadges source={source} />
                </div>
                <p className="mt-auto pt-2 text-xs text-slate-400">
                  Used for:{" "}
                  {source.usedFor?.length
                    ? source.usedFor.map(formatDataType).join(", ")
                    : "-"}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            Data attribution
          </p>
          <div className="rounded-lg border border-slate-800">
            {dataAttribution.length ? (
              dataAttribution.map((item) => (
                <div
                  key={item.dataType}
                  className="flex flex-col gap-1 border-t border-slate-800 px-3 py-2 first:border-t-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span
                      className={`text-xs ${item.status === "SUCCESS" ? "text-emerald-300" : item.status === "FAILED" ? "text-rose-300" : "text-slate-400"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    {item.sources.length
                      ? `Loaded from ${item.sources.map((source) => source.displayName || source.sourceType).join(" / ")}`
                      : `Not available${item.errorMessage ? `: ${item.errorMessage}` : ""}`}
                  </p>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">
                {isLoading
                  ? "Loading attribution..."
                  : "No attribution data yet."}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
          <p>Now syncing: idle</p>
          <p>Last sync payload: Run sync to capture detailed result in UI</p>
          <p className="mt-1 text-xs text-slate-500">
            Source choice is recorded per data type; unavailable rows explain
            which permission is missing.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function SourceAccessModal({
  access,
  onClose,
}: {
  access: TelegramChannelSourceAccess | null;
  onClose: () => void;
}) {
  if (!access) return null;
  const permissions = [
    ["Can create/publish posts", access.permissions.canPostMessages],
    ["Can edit posts", access.permissions.canEditMessages],
    ["Can delete posts", access.permissions.canDeleteMessages],
    ["Can invite users", access.permissions.canInviteUsers],
    ["Can manage invite links", access.permissions.canManageInviteLinks],
    ["Can view/export analytics", access.permissions.canViewStats],
  ] as const;
  return (
    <Modal open={!!access} onClose={onClose} title="Source access">
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <TelegramSourceAvatar
            avatarUrl={access.avatarUrl}
            sourceType={access.sourceType}
            alt={access.displayName}
            size="md"
          />
          <div>
            <p className="font-semibold text-white">{access.displayName}</p>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <span>{access.sourceType}</span>
              <span>·</span>
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, access.sourceType)}
              />
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <p className="text-xs text-slate-400">Role in channel</p>
            <div className="mt-1">
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, access.sourceType)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <p className="text-xs text-slate-400">Analytics</p>
            <p className="mt-1 font-medium text-slate-100">
              {access.canBeUsedForAnalytics
                ? "Can be used for analytics"
                : "Not enough access for analytics"}
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 font-medium text-slate-200">Permissions</p>
          <p className="mb-3 text-xs text-slate-400">
            {inviteLinksVisibility(access)}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {permissions.map(([label, enabled]) => (
              <p
                key={label}
                className={enabled ? "text-emerald-300" : "text-slate-500"}
              >
                {enabled ? "Yes" : "No"} · {label}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ChannelFinanceMiniSummary({
  channel,
  isOwnChannel,
  moneySettings,
  rates,
  actions,
}: {
  channel: TelegramChannel;
  isOwnChannel: boolean;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  actions?: ReactNode;
}) {
  const audience = channel.preview?.audience;
  const summary = channel.preview?.financialSummary;
  const economics = summary?.assetEconomics;
  const primaryCurrency = moneySettings?.primaryCurrency || "USD";
  const hasNumber = (value: unknown) =>
    value != null && Number.isFinite(Number(value));
  const hasPositiveNumber = (value: unknown) =>
    hasNumber(value) && Number(value) > 0;
  const moneyValue = (
    value: unknown,
    className = "font-semibold text-slate-100",
  ) => (
    <MoneyStack
      amount={Number(value)}
      currency={primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName={className}
      subClassName="text-[11px] leading-tight text-slate-500"
    />
  );
  const kpiStatus = summary?.kpiStatus;
  const kpiTone =
    kpiStatus === "good"
      ? "border-emerald-800/80 bg-emerald-950/10"
      : kpiStatus === "acceptable"
        ? "border-yellow-800/80 bg-yellow-950/10"
        : kpiStatus === "bad"
          ? "border-rose-800/80 bg-rose-950/10"
          : "border-slate-800 bg-slate-900/30";
  const metrics: Array<{
    label: string;
    value: ReactNode;
    prominent?: boolean;
    tip?: string;
  }> = [];
  const joinedSubscribers = hasNumber(summary?.totalJoinedSubscribers)
    ? Number(summary?.totalJoinedSubscribers)
    : null;
  const pendingSubscribers = hasNumber(summary?.totalPendingSubscribers)
    ? Number(summary?.totalPendingSubscribers)
    : null;
  const attributedSubscribers = hasNumber(summary?.totalAttributedSubscribers)
    ? Number(summary?.totalAttributedSubscribers)
    : null;
  const paidActiveSubscribers = hasNumber(
    summary?.paidActiveSubscribersEstimate,
  )
    ? Number(summary?.paidActiveSubscribersEstimate)
    : null;
  const totalSubscribers = hasNumber(
    audience?.subscribersCount ?? channel.currentSubscribersCount,
  )
    ? Number(audience?.subscribersCount ?? channel.currentSubscribersCount)
    : null;
  const acquisitionCost = hasNumber(summary?.acquisitionCost)
    ? Number(summary?.acquisitionCost)
    : 0;
  const adSpend = hasNumber(summary?.totalAdSpend)
    ? Number(summary?.totalAdSpend)
    : 0;
  const hasAdExpense = adSpend > 0;
  const hasPurchaseExpense = acquisitionCost > 0;
  const financeTotal = hasNumber(summary?.totalSpend)
    ? Number(summary?.totalSpend)
    : hasNumber(summary?.totalAdSpend)
      ? Number(summary?.totalAdSpend)
      : 0;
  const subscribersBaseForCost =
    attributedSubscribers != null && attributedSubscribers > 0
      ? attributedSubscribers
      : totalSubscribers;
  const inactiveSubscribers =
    (joinedSubscribers != null || totalSubscribers != null) &&
    paidActiveSubscribers != null
      ? Math.max(
          (joinedSubscribers != null
            ? joinedSubscribers
            : totalSubscribers || 0) - paidActiveSubscribers,
          0,
        )
      : null;
  const inactiveCpa =
    inactiveSubscribers && financeTotal > 0
      ? financeTotal / inactiveSubscribers
      : null;
  if (hasAdExpense && hasPurchaseExpense && financeTotal > 0) {
    metrics.push({
      label: "Total spend",
      value: moneyValue(-financeTotal, "font-semibold text-rose-200"),
      prominent: true,
    });
  }
  if (hasAdExpense) {
    metrics.push({
      label: "Ad spend",
      value: moneyValue(-adSpend, "font-semibold text-rose-200"),
    });
  }
  if (hasPurchaseExpense) {
    metrics.push({
      label: "Bought for",
      value: moneyValue(acquisitionCost, "font-semibold text-slate-100"),
    });
  }
  if (hasPositiveNumber(summary?.avgCpa)) {
    metrics.push({
      label: "CPA / sub",
      value: moneyValue(summary?.avgCpa),
      tip:
        "CPA / sub: ad spend divided by attributed subscribers from paid invite links.\n\n" +
        "Attributed subscribers = joined subscribers + pending join requests.\n\n" +
        "This is not the total current Telegram subscriber count.",
    });
  } else if (
    financeTotal > 0 &&
    subscribersBaseForCost != null &&
    subscribersBaseForCost > 0
  ) {
    metrics.push({
      label: "CPA / sub",
      value: moneyValue(financeTotal / subscribersBaseForCost),
      tip: "For bought channels, CPA / sub uses total channel cost divided by current subscribers.",
    });
  }
  if (hasPositiveNumber(summary?.activeCpa)) {
    metrics.push({
      label: "CPA / active",
      value: moneyValue(summary?.activeCpa),
      prominent: true,
      tip:
        "CPA / active: ad spend divided by estimated active paid subscribers.\n\n" +
        `Active subscriber: a joined paid subscriber still estimated active, based on the ${channel.activeSubscribersWindow || 5}-post active window.`,
    });
  } else if (
    financeTotal > 0 &&
    paidActiveSubscribers != null &&
    paidActiveSubscribers > 0
  ) {
    metrics.push({
      label: "CPA / active",
      value: moneyValue(financeTotal / paidActiveSubscribers),
      prominent: true,
      tip: "For bought channels, CPA / active uses total channel cost divided by current active audience estimate.",
    });
  }
  if (hasPositiveNumber(inactiveCpa)) {
    metrics.push({
      label: "CPA / inactive",
      value: moneyValue(inactiveCpa),
      tip:
        "CPA / inactive: ad spend divided by inactive paid subscribers.\n\n" +
        "Inactive subscriber: joined paid subscriber minus active paid subscriber.",
    });
  }
  if (hasPositiveNumber(summary?.totalJoinedSubscribers)) {
    metrics.push({
      label: "Joined",
      value: formatNumber(summary?.totalJoinedSubscribers),
    });
  }
  if (hasPositiveNumber(summary?.totalPendingSubscribers)) {
    metrics.push({
      label: "Pending",
      value: formatNumber(summary?.totalPendingSubscribers),
    });
  }
  if (
    attributedSubscribers != null &&
    attributedSubscribers > 0 &&
    hasPositiveNumber(summary?.totalJoinedSubscribers) &&
    hasPositiveNumber(summary?.totalPendingSubscribers)
  ) {
    metrics.push({
      label: "Total",
      value: formatNumber(attributedSubscribers),
    });
  }
  if (hasNumber(audience?.viewRate)) {
    metrics.push({
      label: "View rate",
      value: formatPercent(audience?.viewRate, 1),
    });
  }
  const showQuality =
    isOwnChannel && audience?.dataQuality && audience.dataQuality !== "normal";
  const cpaMetrics = metrics
    .filter((metric) => metric.label.startsWith("CPA /"))
    .slice(0, 3);
  const topMetrics = metrics.filter(
    (metric) =>
      metric.label === "Total spend" ||
      metric.label === "Ad spend" ||
      metric.label === "Bought for",
  );
  const supportingMetrics = metrics.filter(
    (metric) =>
      !metric.label.startsWith("CPA /") &&
      metric.label !== "Total spend" &&
      metric.label !== "Ad spend" &&
      metric.label !== "Bought for",
  );
  const kpiTargets = [
    formatCompactKpiRange(
      "target",
      channel.targetCpaFrom,
      channel.targetCpa,
      false,
      "target",
    ),
    formatCompactKpiRange(
      "ok",
      channel.acceptableCpaFrom,
      channel.acceptableCpa,
      false,
      "ok",
    ),
    formatCompactKpiRange(
      "stop",
      channel.stopCpaFrom ?? channel.stopCpa,
      null,
      true,
      "stop",
    ),
  ].filter((target): target is KpiRange => Boolean(target));

  return (
    <div className={`mt-2 rounded-md border p-3 ${kpiTone}`}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Performance
            </p>
            <p className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-hidden whitespace-nowrap text-sm font-semibold leading-tight text-slate-100">
              <span className="inline-flex items-center whitespace-nowrap">
                {formatNumber(
                  audience?.subscribersCount ?? channel.currentSubscribersCount,
                )}{" "}
                subs
              </span>
              {isOwnChannel &&
              hasNumber(audience?.activeSubscribersEstimate) ? (
                <span className="inline-flex items-center whitespace-nowrap font-normal text-slate-500">
                  · {formatNumber(audience?.activeSubscribersEstimate)} active
                </span>
              ) : null}
              {isOwnChannel &&
              inactiveSubscribers != null &&
              inactiveSubscribers > 0 ? (
                <span className="inline-flex items-center whitespace-nowrap font-normal text-slate-500">
                  · {formatNumber(inactiveSubscribers)} inactive
                </span>
              ) : null}
            </p>
          </div>
          {kpiStatus && kpiStatus !== "unknown" ? (
            <KpiPreviewTooltip
              summary={summary}
              targets={kpiTargets}
              className="shrink-0"
            >
              <span
                className={`rounded border px-2 py-0.5 text-[11px] ${kpiBadgeClass(kpiStatus)}`}
              >
                {summary?.kpiLabel || kpiStatus}
              </span>
            </KpiPreviewTooltip>
          ) : null}
        </div>

        {economics ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-xs">
            <p className="font-medium text-slate-300">
              Finance · {economics.currency}
            </p>
            {economics.conversionUnavailable ? (
              <p className="mt-1 text-slate-500">
                Some amounts are unavailable because an exchange rate is
                missing.
              </p>
            ) : (
              <p className="mt-1 text-slate-400">
                {formatNumber(economics.invested, 2)} invested ·{" "}
                {formatNumber(economics.revenue, 2)} revenue
                {economics.paybackPercent == null
                  ? ""
                  : ` · ${formatPercent(economics.paybackPercent)} paid back`}
                {economics.remainingToBreakEven === 0
                  ? " · Paid back"
                  : economics.estimatedAdsRemaining == null
                    ? ""
                    : ` · ≈${economics.estimatedAdsRemaining} ads to break even`}
              </p>
            )}
          </div>
        ) : null}

        {metrics.length ? (
          <div className="space-y-2 text-xs">
            {topMetrics.length ? (
              <div className="grid grid-cols-3 gap-2">
                {topMetrics.map((metric) => (
                  <PreviewMetric
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    prominent={false}
                  />
                ))}
              </div>
            ) : null}
            {cpaMetrics.length ? (
              <div className="grid grid-cols-3 gap-2">
                {cpaMetrics.map((metric) => (
                  <PreviewMetric
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    prominent
                    compact
                    tip={metric.tip}
                  />
                ))}
              </div>
            ) : null}
            {supportingMetrics.length ? (
              <div className="grid grid-cols-3 gap-2">
                {supportingMetrics.map((metric) => (
                  <PreviewMetric
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    prominent={metric.prominent}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {showQuality || kpiTargets.length ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {showQuality && audience?.dataQuality ? (
              <DataQualityBadge
                quality={audience.dataQuality}
                reason={audience?.dataQualityReason}
                warning={audience?.dataQualityWarning}
                rawViewRate={audience?.rawViewRate}
                subscriberBaseQuality={audience?.subscriberBaseQuality}
              />
            ) : null}
            {kpiTargets.length ? (
              <KpiPreviewTooltip summary={summary} targets={kpiTargets}>
                <span className="inline-flex flex-wrap items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                  <span className="font-semibold text-slate-200">KPI $:</span>
                  {kpiTargets.map((target) => (
                    <span
                      key={target.label}
                      className={`rounded border px-1.5 py-0.5 ${kpiRangeClass(target.kind)}`}
                    >
                      {target.label}
                    </span>
                  ))}
                </span>
              </KpiPreviewTooltip>
            ) : null}
          </div>
        ) : null}

        {actions ? (
          <div className="grid w-full grid-cols-2 items-center gap-2 pt-1 [&>*]:w-full">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KpiPreviewTooltip({
  summary,
  targets,
  children,
  className = "",
}: {
  summary?: TelegramChannelFinancialSummary;
  targets: KpiRange[];
  children: ReactNode;
  className?: string;
}) {
  const currentCpa =
    summary?.avgCpa == null || !Number.isFinite(Number(summary.avgCpa))
      ? null
      : Number(summary.avgCpa);
  const joined = Number(summary?.totalJoinedSubscribers || 0);
  const pending = Number(summary?.totalPendingSubscribers || 0);
  const total = Number(summary?.totalAttributedSubscribers || 0);
  return (
    <span className={`group relative inline-flex cursor-help ${className}`}>
      {children}
      <TooltipBubble
        side="top"
        align="right"
        className="hidden w-72 border-slate-700 bg-slate-950 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        <span className="block font-semibold text-white">
          KPI is calculated by attributed CPA / sub
        </span>
        <span className="mt-1 block text-slate-300">
          Current CPA / sub:{" "}
          <span className="font-semibold text-white">
            {currentCpa == null
              ? "not enough data"
              : `$ ${formatNumber(currentCpa, 2)}`}
          </span>
        </span>
        {summary ? (
          <span className="mt-1 block text-slate-400">
            {[
              joined > 0 ? `Joined ${formatNumber(joined)}` : null,
              pending > 0 ? `Pending ${formatNumber(pending)}` : null,
              joined > 0 && pending > 0 && total > 0
                ? `Total ${formatNumber(total)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No attributed subscribers yet"}
          </span>
        ) : null}
        {summary?.kpiStatus && summary.kpiStatus !== "unknown" ? (
          <span className="mt-1 block text-slate-300">
            Result:{" "}
            <span
              className={kpiBadgeClass(summary.kpiStatus).replace(
                "border-",
                "text-",
              )}
            >
              {summary.kpiLabel || summary.kpiStatus}
            </span>
          </span>
        ) : null}
        {targets.length ? (
          <span className="mt-2 block text-slate-400">
            Ranges: {targets.map((target) => target.label).join(" · ")}
          </span>
        ) : null}
      </TooltipBubble>
    </span>
  );
}

type KpiRange = {
  kind: "target" | "ok" | "stop";
  label: string;
};

function formatCompactKpiRange(
  label: string,
  from: unknown,
  to: unknown,
  openEnded = false,
  kind: KpiRange["kind"] = "target",
): KpiRange | null {
  const hasFrom = from != null && Number.isFinite(Number(from));
  const hasTo = to != null && Number.isFinite(Number(to));
  if (!hasFrom && !hasTo) return null;
  const fromText = hasFrom ? formatNumber(from, 2) : "";
  const toText = hasTo ? formatNumber(to, 2) : "";
  if (openEnded)
    return fromText ? { kind, label: `${label} ${fromText}+` } : null;
  if (fromText && toText)
    return { kind, label: `${label} ${fromText}-${toText}` };
  if (fromText) return { kind, label: `${label} from ${fromText}` };
  return { kind, label: `${label} to ${toText}` };
}

function kpiRangeClass(kind: KpiRange["kind"]) {
  if (kind === "target")
    return "border-emerald-800 bg-emerald-950/40 text-emerald-200";
  if (kind === "ok")
    return "border-yellow-800 bg-yellow-950/40 text-yellow-200";
  return "border-rose-800 bg-rose-950/40 text-rose-200";
}

type TooltipPlacement = {
  x: "left" | "right";
  y: "top" | "bottom";
};

function tooltipPlacementClass(placement: TooltipPlacement) {
  return placement.x === "right" ? "right-0" : "left-0";
}

function resolveTooltipPlacement(
  rect: DOMRect,
  width = 320,
  height = 220,
): TooltipPlacement {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return {
    x: rect.left + width > viewportWidth - 16 ? "right" : "left",
    y: rect.bottom + height > viewportHeight - 16 ? "top" : "bottom",
  };
}

function InfoTooltip({ tip }: { tip: string }) {
  const [placement, setPlacement] = useState<TooltipPlacement>({
    x: "left",
    y: "bottom",
  });
  return (
    <span
      className="group relative inline-flex align-middle"
      onMouseEnter={(event) =>
        setPlacement(
          resolveTooltipPlacement(event.currentTarget.getBoundingClientRect()),
        )
      }
      onFocus={(event) =>
        setPlacement(
          resolveTooltipPlacement(event.currentTarget.getBoundingClientRect()),
        )
      }
    >
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-600 text-slate-400">
        <CircleHelp size={11} />
      </span>
      <TooltipBubble
        side={placement.y === "top" ? "top" : "bottom"}
        align={placement.x === "right" ? "right" : "left"}
        className={`w-80 whitespace-pre-line border-slate-700 bg-slate-950 text-xs font-normal leading-relaxed text-slate-100 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipPlacementClass(placement)}`}
      >
        {tip}
      </TooltipBubble>
    </span>
  );
}

function DataQualityBadge({
  quality,
  reason,
  warning,
  rawViewRate,
  subscriberBaseQuality,
}: {
  quality: string;
  reason?: string | null;
  warning?: string | null;
  rawViewRate?: number | null;
  subscriberBaseQuality?: string | null;
}) {
  const reasonText = dataQualityReasonText(reason);
  const badgeClass = kpiBadgeClass(
    quality === "normal"
      ? "good"
      : quality === "borderline"
        ? "acceptable"
        : "bad",
  );
  return (
    <span className="group relative mt-1 inline-flex cursor-help">
      <span
        className={`inline-flex rounded border px-2 py-0.5 text-xs ${badgeClass}`}
      >
        {quality}
      </span>
      <TooltipBubble
        side="top"
        align="left"
        className="hidden w-72 border-slate-700 bg-slate-950 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        <span className="block font-semibold text-white">
          Data quality: {quality}
        </span>
        <span className="mt-1 block text-slate-300">
          This checks whether subscriber-based metrics look trustworthy.
        </span>
        <span className="mt-2 block text-slate-400">
          Normal: raw view rate up to 80%. Borderline: 80-120%. Suspicious:
          120-200%. Anomalous: above 200% or invalid input.
        </span>
        {rawViewRate != null ? (
          <span className="mt-2 block text-slate-300">
            Current raw view rate: {formatPercent(rawViewRate, 1)}.
          </span>
        ) : null}
        {subscriberBaseQuality && subscriberBaseQuality !== "normal" ? (
          <span className="mt-1 block text-amber-200">
            Subscriber base: {subscriberBaseQuality}.
          </span>
        ) : null}
        {reasonText ? (
          <span className="mt-1 block text-slate-300">{reasonText}</span>
        ) : null}
        {warning ? (
          <span className="mt-1 block text-amber-200">{warning}</span>
        ) : null}
      </TooltipBubble>
    </span>
  );
}

function dataQualityReasonText(reason?: string | null) {
  if (reason === "views_within_normal_range") {
    return "Views are within the expected range for the subscriber base.";
  }
  if (reason === "views_close_to_subscribers_limit") {
    return "Views are close to subscriber count, so the estimate may be less stable.";
  }
  if (reason === "views_exceed_subscribers") {
    return "Views exceed subscribers, which can indicate external traffic, reposts, viral reach, or manipulation.";
  }
  if (reason === "views_strongly_exceed_subscribers") {
    return "Views strongly exceed subscribers, so active subscriber metrics are capped.";
  }
  if (reason === "subscriber_base_polluted") {
    return "Subscriber base is marked suspicious or polluted, so metrics are downgraded.";
  }
  if (reason === "missing_subscribers_or_views") {
    return "There are not enough valid subscribers or views to calculate this reliably.";
  }
  if (reason === "views_uplift_without_new_subscribers") {
    return "Views increased without matching subscriber growth.";
  }
  return "";
}

function PreviewMetric({
  label,
  value,
  prominent,
  compact,
  tip,
}: {
  label: string;
  value: ReactNode;
  prominent?: boolean;
  compact?: boolean;
  tip?: string;
}) {
  return (
    <div
      className={`${prominent ? "rounded border border-slate-800/80 px-2 py-1" : ""} ${compact ? "min-w-0" : ""}`}
    >
      <p className="flex min-w-0 items-center gap-1 text-slate-500">
        <span className="truncate">{label}</span>
        {tip ? <InfoTooltip tip={tip} /> : null}
      </p>
      <div className="mt-0.5 truncate font-medium text-slate-100">{value}</div>
    </div>
  );
}

function PermissionSummaryBadges({
  source,
}: {
  source: TelegramChannelSourceAccess;
}) {
  if (hasFullAccess(source)) {
    return (
      <>
        <span className="text-slate-500">·</span>
        <AccessBadge
          label="Full access"
          tip={fullAccessTooltip(source)}
          tone="success"
        />
        <AccessBadge
          label={inviteLinksBadgeLabel(source)}
          tip={inviteLinksVisibility(source)}
          tone="info"
        />
      </>
    );
  }
  const labels = [
    source.permissions.canPostMessages ? "post" : null,
    source.permissions.canEditMessages ? "edit" : null,
    source.permissions.canDeleteMessages ? "delete" : null,
    source.permissions.canManageInviteLinks
      ? inviteLinksBadgeLabel(source)
      : null,
    source.permissions.canViewStats ? "stats" : null,
  ].filter(Boolean);
  return (
    <span>
      {labels.length ? `· ${labels.join(", ")}` : "· unknown permissions"}
    </span>
  );
}

function AccessBadge({
  label,
  tip,
  tone = "default",
}: {
  label: string;
  tip: string;
  tone?: "default" | "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-700 text-emerald-200"
      : tone === "info"
        ? "border-blue-700 text-blue-200"
        : "border-slate-700 text-slate-200";
  return (
    <span
      className={`group relative inline-flex rounded border px-2 py-0.5 text-xs ${toneClass}`}
    >
      {label}
      <TooltipBubble
        side="top"
        align="left"
        className="hidden w-64 border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        {tip}
      </TooltipBubble>
    </span>
  );
}

function hasFullAccess(source: TelegramChannelSourceAccess) {
  return (
    source.role === "OWNER" ||
    (source.role === "ADMIN" &&
      source.permissions.canPostMessages &&
      source.permissions.canEditMessages &&
      source.permissions.canDeleteMessages &&
      source.permissions.canManageInviteLinks &&
      source.permissions.canViewStats)
  );
}

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function roleTooltip(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Owner has the highest channel access: can manage posts, admins, stats, and all invite links when Telegram returns these permissions.";
  if (role === "ADMIN")
    return `Admin access depends on granted Telegram rights. This ${sourceType === "BOT" ? "bot" : "account"} may publish, edit, delete, invite, or view stats only if those rights are enabled.`;
  if (role === "MEMBER")
    return "Member access is not enough for analytics unless Telegram grants specific admin-level rights.";
  return "Unknown means Telegram did not return a clear channel role for this source.";
}

function fullAccessTooltip(source: TelegramChannelSourceAccess) {
  return `Full access means this source has all meaningful analytics permissions currently tracked: publish, edit, delete, invite links, and stats. ${inviteLinksVisibility(source)}`;
}

function inviteLinksBadgeLabel(source: TelegramChannelSourceAccess) {
  if (source.role === "OWNER") return "All invite links";
  if (source.sourceType === "BOT") return "Own bot links only";
  return "Own admin links only";
}

function inviteLinksVisibility(source: TelegramChannelSourceAccess) {
  if (source.role === "OWNER")
    return "Invite links: owner access can see all channel invite links.";
  if (source.sourceType === "BOT")
    return "Invite links: bots can see only invite links created by this bot.";
  return "Invite links: admins can see only invite links created by this admin account.";
}

function summarizeSync(result: any) {
  const status = result?.status || "success";
  const historical = result?.historical || {};
  const publicInfo = result?.publicInfo || {};
  const posts = result?.postsMetricsSync || {};
  const olderPosts = result?.olderPostsBackfill || {};
  const stats = result?.channelStatsSync || {};
  const importedLinks = toNumber(historical.imported);
  const updatedLinks = toNumber(historical.updated);
  const dailyRows = toNumber(historical.postsUpdated);
  const syncedPosts = toNumber(posts.syncedPosts);
  const olderSyncedPosts = toNumber(olderPosts.syncedPosts);
  const points = toNumber(stats.pointsUpserted);
  const period = formatStatsPeriod(
    stats.snapshot?.normalizedStats?.period,
    stats.snapshot?.normalizedStats?.graphs,
  );
  const publicText = publicInfo.updated
    ? `Channel info: refreshed${publicInfo.subscribersCount != null ? `, ${formatNumber(publicInfo.subscribersCount)} subscribers` : ""}.`
    : publicInfo.reason
      ? `Channel info: not updated (${publicInfo.reason}).`
      : "Channel info: refreshed.";
  const linkText =
    importedLinks || updatedLinks
      ? `Invite links: added ${importedLinks}, updated ${updatedLinks}.`
      : "Invite links: no new or changed links.";
  const inviteGapText =
    historical.inviteLinksScope === "PARTIAL_ADMINS"
      ? `Invite links fetched ${toNumber(historical.inviteLinksFetchedTotal)} of ${toNumber(historical.inviteLinksExpectedTotal)} expected, missing ${toNumber(historical.inviteLinksMissingTotal)}.`
      : null;
  const postText =
    dailyRows || syncedPosts || olderSyncedPosts
      ? `Posts: refreshed ${syncedPosts} post metrics, backfilled ${olderSyncedPosts} older posts, and ${dailyRows} daily rows.`
      : "Posts: no post updates returned.";
  const statsText = stats.success
    ? `Analytics: loaded ${points} chart points${period !== "-" ? ` for ${period}` : ""}.`
    : `Analytics: not updated${stats.snapshot?.normalizedStats?.status ? ` (${stats.snapshot.normalizedStats.status})` : ""}.`;
  return [
    status === "partial" ? "Sync completed partially." : "Sync completed.",
    publicText,
    linkText,
    inviteGapText,
    postText,
    statsText,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatStatsPeriod(period: any, graphs?: Record<string, any>) {
  if (!period) return "-";
  const graphDates = extractGraphDateValues(graphs);
  const minDate = earliestTelegramDateValue([
    period.minDate || period.min_date,
    ...graphDates,
  ]);
  const maxDate = latestTelegramDateValue([
    period.maxDate || period.max_date,
    ...graphDates,
  ]);
  return `${formatTelegramDate(minDate)} - ${formatTelegramDate(maxDate)}`;
}

function formatTelegramDate(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue))
    return formatLocalDate(value as string | Date | null);
  return formatLocalDate(
    new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue),
  );
}

function latestTelegramDateValue(values: unknown[]) {
  let latest: unknown = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function earliestTelegramDateValue(values: unknown[]) {
  let earliest: unknown = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time === Number.NEGATIVE_INFINITY) continue;
    if (time < earliestTime) {
      earliest = value;
      earliestTime = time;
    }
  }
  return earliest;
}

function extractGraphDateValues(graphs?: Record<string, any>) {
  const values: unknown[] = [];
  for (const graph of Object.values(graphs || {})) {
    const columns = graph?.data?.columns;
    if (!Array.isArray(columns)) continue;
    const dates = columns.find(
      (column: unknown) => Array.isArray(column) && column[0] === "x",
    );
    if (!Array.isArray(dates)) continue;
    values.push(...dates.slice(1));
  }
  return values;
}

function toTelegramDateTime(value: unknown) {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime())
    ? Number.NEGATIVE_INFINITY
    : date.getTime();
}

export default function TelegramChannelsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mtprotoCreateOpen, setMtprotoCreateOpen] = useState(false);
  const tab = parseTelegramTab(searchParams.get("tab"));
  const channelFilter = parseChannelFilter(searchParams.get("channelTab"));
  const lifecycleTab = parseChannelLifecycleTab(searchParams.get("lifecycle"));
  const accountFilter = parseAccountFilter(searchParams.get("accountTab"));
  const [deleting, setDeleting] = useState<TelegramChannel | null>(null);
  const [deletingPerson, setDeletingPerson] =
    useState<AdvertisingChannel | null>(null);
  const [networkFormOpen, setNetworkFormOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
  const [deletingNetwork, setDeletingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
  const [analysisEditor, setAnalysisEditor] = useState<{
    channel: TelegramChannel;
    analysis?: TelegramChannelAdAnalysis;
  } | null>(null);
  const [syncTargetChannel, setSyncTargetChannel] =
    useState<TelegramChannel | null>(null);
  const [syncSelection, setSyncSelection] =
    useState<TelegramChannelSyncSelection>(DEFAULT_CHANNEL_SYNC_SELECTION);
  const [workspaceSyncOpen, setWorkspaceSyncOpen] = useState(false);
  const [deletingAnalysis, setDeletingAnalysis] = useState<{
    channel: TelegramChannel;
    analysis: TelegramChannelAdAnalysis;
  } | null>(null);
  const updateTabs = (next: {
    tab?: TelegramTab;
    channelFilter?: ChannelFilter;
    lifecycle?: ChannelLifecycleTab;
    accountFilter?: AccountFilter;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = next.tab || tab;
    params.set("tab", nextTab);
    if (next.channelFilter) params.set("channelTab", next.channelFilter);
    if (next.lifecycle) params.set("lifecycle", next.lifecycle);
    if (next.accountFilter) params.set("accountTab", next.accountFilter);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const {
    data: channelsResponse,
    isLoading: channelsLoading,
    error: channelsError,
  } = useQuery({
    queryKey: telegramChannelKeys.list(
      channelFilter === "own" && lifecycleTab === "archive",
      channelFilter === "own",
    ),
    queryFn: () =>
      telegramChannelsApi.listWithCounts(
        channelFilter === "own" && lifecycleTab === "archive",
        channelFilter === "own",
      ),
    enabled: tab === "channels" || networkFormOpen || Boolean(editingNetwork),
  });
  const channels = channelsResponse?.items;
  const {
    data: networks = [],
    isLoading: networksLoading,
    error: networksError,
  } = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: tab === "networks",
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    enabled: tab === "networks",
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    enabled: tab === "networks",
  });
  const {
    data: people,
    isLoading: peopleLoading,
    error: peopleError,
  } = useQuery({
    queryKey: ["advertising-people"],
    queryFn: advertisingChannelsApi.list,
    enabled: tab === "accounts" && accountFilter === "people",
  });
  const importMutation = useMutation({
    mutationFn: async ({
      input,
      mode,
    }: {
      input: string;
      mode: "import" | "refresh";
    }) => {
      const progressId = `telegram-channel-${mode}:${Date.now()}`;
      const progressTitle =
        mode === "refresh" ? "Refresh channel" : "Import channel";
      const activeMessage =
        mode === "refresh" ? "Refreshing channel…" : "Importing channel…";
      const completedMessage =
        mode === "refresh"
          ? "Channel refresh completed"
          : "Channel import completed";
      setProgress({
        id: progressId,
        title: progressTitle,
        current: 0,
        total: 5,
        message: mode === "refresh" ? "Starting refresh…" : "Starting import…",
      });
      try {
        const source = await telegramChannelsApi.importWithProgress(
          { input },
          (item: { message?: string }, current, total) => {
            setProgress({
              id: progressId,
              title: progressTitle,
              current,
              total,
              message: item.message || activeMessage,
            });
          },
        );
        setProgress({
          id: progressId,
          title: progressTitle,
          current: 5,
          total: 5,
          message: completedMessage,
          completed: true,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return source;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: async (source: ImportedTelegramSource) => {
      if (!isPersonSource(source)) {
        prependTelegramChannelToCaches(queryClient, source);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["advertising-people"] }),
      ]);
      setImportOpen(false);
      if (isPersonSource(source)) {
        updateTabs({ tab: "accounts", accountFilter: "people" });
      } else {
        updateTabs({
          tab: "channels",
          channelFilter:
            "adminLinks" in source && isOwnChannel(source) ? "own" : "external",
        });
      }
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to import source."),
        "error",
      ),
  });
  const saveAnalysisMutation = useMutation({
    mutationFn: ({
      channelId,
      analysisId,
      payload,
    }: {
      channelId: string;
      analysisId?: string;
      payload: TelegramChannelAdAnalysisPayload;
    }) =>
      analysisId
        ? telegramChannelsApi.updateAdAnalysis(channelId, analysisId, payload)
        : telegramChannelsApi.createAdAnalysis(channelId, payload),
    onSuccess: (analysis) => {
      // The list preview contains server-derived analysis summaries.
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.list(),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-ad-analyses", analysis.telegramChannelId],
      });
      setAnalysisEditor(null);
      pushToast(
        analysis.warning
          ? `Analysis saved. Sync warning: ${analysis.warning}`
          : "Ad analysis saved.",
        analysis.warning ? "info" : "success",
      );
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to save ad analysis."),
        "error",
      ),
  });
  const deleteAnalysisMutation = useMutation({
    mutationFn: ({
      channelId,
      analysisId,
    }: {
      channelId: string;
      analysisId: string;
    }) => telegramChannelsApi.deleteAdAnalysis(channelId, analysisId),
    onSuccess: (analysis) => {
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.list(),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-ad-analyses", analysis.telegramChannelId],
      });
      setDeletingAnalysis(null);
      pushToast("Ad analysis deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete ad analysis."),
        "error",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.remove(id),
    onSuccess: (_result, channelId) => {
      removeTelegramChannelFromCaches(queryClient, channelId);
      setDeleting(null);
      pushToast("Channel deleted with related data.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete channel."),
        "error",
      ),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.archive(id),
    onSuccess: (channel) => {
      moveTelegramChannelBetweenLifecycleCaches(queryClient, channel);
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.selects(),
      });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() });
      pushToast("Channel archived.", "success");
    },
    onError: (error: unknown) =>
      pushToast(
        requestErrorMessage(error, "Failed to archive channel."),
        "error",
      ),
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.restore(id),
    onSuccess: (channel) => {
      moveTelegramChannelBetweenLifecycleCaches(queryClient, channel);
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.selects(),
      });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() });
      pushToast("Channel restored.", "success");
    },
    onError: (error: unknown) =>
      pushToast(
        requestErrorMessage(error, "Failed to restore channel."),
        "error",
      ),
  });
  const deletePersonMutation = useMutation({
    mutationFn: (id: string) => advertisingChannelsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertising-people"] });
      setDeletingPerson(null);
      pushToast("Person deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete person."),
        "error",
      ),
  });
  const createNetworkMutation = useMutation({
    mutationFn: telegramChannelNetworksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setNetworkFormOpen(false);
      pushToast("Network created.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to create network."),
        "error",
      ),
  });
  const updateNetworkMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name?: string;
        description?: string | null;
        iconId?: string | null;
        telegramChannelIds?: string[];
        excludedTelegramChannelIds?: string[];
      };
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setEditingNetwork(null);
      setNetworkFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to update network."),
        "error",
      ),
  });
  const deleteNetworkMutation = useMutation({
    mutationFn: (id: string) => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setDeletingNetwork(null);
      pushToast("Network deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete network."),
        "error",
      ),
  });
  const syncNowMutation = useMutation({
    mutationFn: async ({
      channel,
      payload,
    }: {
      channel: TelegramChannel;
      payload: TelegramChannelSyncNowPayload;
    }) => {
      const progressId = `telegram-channel-sync:${channel.id}`;
      setProgress({
        id: progressId,
        title: `Sync ${channel.title}`,
        current: 0,
        total: 8,
        message: "Starting sync…",
        iconUrl: channel.photoUrl || undefined,
      });
      try {
        const result = await syncTelegramChannelNowWithProgress(
          channel.id,
          (item, current, total) => {
            setProgress(
              syncProgressToToast({
                id: progressId,
                title: `Sync ${channel.title}`,
                item,
                current,
                total,
                iconUrl: channel.photoUrl || undefined,
              }),
            );
          },
          payload,
        );
        const partial = result?.status === "partial";
        const failed = result?.status === "failed";
        setProgress({
          id: progressId,
          title: `Sync ${channel.title}`,
          current: 8,
          total: 8,
          message: failed
            ? "Channel sync failed"
            : partial
              ? "Channel sync completed partially"
              : "Channel sync completed",
          completed: !failed,
          successCount: failed ? 0 : partial ? 0 : 1,
          failedCount: failed ? 1 : 0,
          skippedCount: partial ? 1 : 0,
          iconUrl: channel.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return { channelId: channel.id, result };
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: ({ channelId, result }) => {
      setSyncTargetChannel(null);
      // A remote sync can change posts, analytics and derived card previews.
      void invalidateTelegramChannelQueries(queryClient, channelId);
      pushToast(
        summarizeSync(result),
        result?.status === "partial" ? "info" : "success",
        8000,
      );
    },
    onError: (requestError: unknown) =>
      pushToast(requestErrorMessage(requestError, "Sync failed."), "error"),
  });
  const filteredChannels = useMemo(
    () => sortChannelsByScale(channels || []),
    [channels],
  );
  const ownChannels = useMemo(
    () => (channels || []).filter(isOwnChannel),
    [channels],
  );
  const hasLoadedChannels = Boolean(channels?.[0]);
  const hasLoadedPeople = Boolean(people?.[0]);
  const channelsInitialLoading = channelsLoading && !hasLoadedChannels;
  const channelsInitialError = Boolean(channelsError) && !hasLoadedChannels;
  const peopleInitialLoading = peopleLoading && !hasLoadedPeople;
  const peopleInitialError = Boolean(peopleError) && !hasLoadedPeople;
  const emptyText =
    channelFilter === "own" ? "No own channels" : "No external channels";
  const handleExport = async (channelIds: string[]) => {
    const selectedChannels = (channels || []).filter((channel) =>
      channelIds.includes(channel.id),
    );
    if (!selectedChannels.length) {
      pushToast("Select at least one channel.", "error");
      return;
    }
    setExporting(true);
    try {
      for (const channel of selectedChannels) {
        const blob = await telegramChannelsApi.export(channel.id);
        const baseName = safeExportFileName(channel.username || channel.title);
        downloadBlob(
          blob,
          `${baseName}_export_${new Date().toISOString().slice(0, 10)}.xlsx`,
        );
      }
      setExportOpen(false);
      pushToast(
        selectedChannels.length === 1
          ? "Export downloaded."
          : `Downloaded ${selectedChannels.length} export files.`,
        "success",
      );
    } catch (requestError) {
      pushToast(requestErrorMessage(requestError, "Export failed."), "error");
    } finally {
      setExporting(false);
    }
  };
  const headerAction =
    tab === "networks" ? (
      <Button
        onClick={() => {
          setEditingNetwork(null);
          setNetworkFormOpen(true);
        }}
      >
        Create network
      </Button>
    ) : tab === "accounts" && accountFilter === "mtproto" ? (
      <Button onClick={() => setMtprotoCreateOpen(true)}>
        Connect account
      </Button>
    ) : tab === "channels" ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setWorkspaceSyncOpen(true)}
          className="inline-flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Sync all channels
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setExportOpen(true)}
          disabled={!channels?.length}
          className="inline-flex items-center gap-2"
        >
          <Download size={16} />
          Export
        </Button>
        <Button onClick={() => setImportOpen(true)}>Import</Button>
      </div>
    ) : (
      <Button onClick={() => setImportOpen(true)}>Import</Button>
    );

  return (
    <AppShell>
      <PageHeader
        title="Telegram"
        subtitle="Channels and Telegram accounts"
        action={headerAction}
      />
      <div className="mb-5 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-1">
        {(["channels", "networks", "accounts"] as TelegramTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${tab === item ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
            onClick={() => updateTabs({ tab: item })}
          >
            {item === "channels"
              ? "Channels"
              : item === "networks"
                ? "Networks"
                : "Accounts"}
          </button>
        ))}
      </div>
      {tab === "channels" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["own", "external"] as ChannelFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${channelFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "channels", channelFilter: item })
                }
              >
                {item === "own" ? "Our channels" : "External channels"}
              </button>
            ))}
          </div>
          {channelFilter === "own" ? (
            <div className="mb-3 flex gap-1 border-b border-neutral-800">
              {(["active", "archive"] as ChannelLifecycleTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`border-b-2 px-3 py-2 text-sm ${lifecycleTab === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                  onClick={() =>
                    updateTabs({ tab: "channels", lifecycle: item })
                  }
                >
                  {item === "active"
                    ? `Active (${channelsResponse?.counts.active ?? 0})`
                    : `Archive (${channelsResponse?.counts.archived ?? 0})`}
                </button>
              ))}
            </div>
          ) : null}
          {channelsInitialLoading ? <LoadingState /> : null}
          {channelsInitialError ? (
            <div className="text-red-300">Failed to load channels</div>
          ) : null}
          <MasonryGrid>
            {filteredChannels.map((channel: TelegramChannel) => {
              const hasAdminLink = isOwnChannel(channel);
              const username = normalizeUsername(channel.username);
              return (
                <div
                  key={channel.id}
                  className="rounded-xl border border-neutral-800/80 bg-neutral-900/55 p-4 text-sm text-neutral-300"
                >
                  <ChannelPreview
                    channel={channel}
                    status={
                      hasAdminLink ? (
                        <ChannelStatusBadges
                          connection={channel.preview?.systemBotConnection}
                          archived={Boolean(channel.archivedAt)}
                        />
                      ) : undefined
                    }
                    rightAction={
                      <ChannelActionsMenu
                        channel={channel}
                        currencySettings={currencySettings}
                        archived={Boolean(channel.archivedAt)}
                        canArchive={hasAdminLink}
                        onRestore={() => restoreMutation.mutate(channel.id)}
                        onArchive={() => archiveMutation.mutate(channel.id)}
                        onDelete={() => setDeleting(channel)}
                      >
                        {hasAdminLink ? (
                          <ChannelMenuLink
                            label="Open channel"
                            href={`/telegram/channels/${channel.id}`}
                            icon={<ArrowUpRight size={17} />}
                          />
                        ) : null}
                        {hasAdminLink && !channel.archivedAt ? (
                          <ChannelMenuAction
                            label="Sync channel"
                            icon={<RefreshCw size={17} />}
                            onClick={() => {
                              setSyncTargetChannel(channel);
                              setSyncSelection(
                                syncSelectionFromChannel(channel),
                              );
                            }}
                          />
                        ) : null}
                        {!hasAdminLink && username && !channel.archivedAt ? (
                          <ChannelMenuAction
                            label="Refresh public data"
                            icon={<RefreshCw size={17} />}
                            onClick={() =>
                              importMutation.mutate({
                                input: `@${username}`,
                                mode: "refresh",
                              })
                            }
                          />
                        ) : null}
                        {hasAdminLink &&
                        !channel.archivedAt &&
                        channel.preview?.canPostMessages ? (
                          <ChannelMenuLink
                            label="Posts"
                            href={buildTelegramPostsUrl({
                              channelId: channel.id,
                              postView: "editor",
                            })}
                            icon={<Send size={17} />}
                          />
                        ) : null}
                        {hasAdminLink ? (
                          <ChannelSourcesSummary
                            channelId={channel.id}
                            sourcesCount={
                              channel.preview?.sourcesCount ??
                              channel.adminLinks?.length ??
                              0
                            }
                            menuItem
                          />
                        ) : null}
                        {!channel.archivedAt ? (
                          <div className="flex items-center justify-between px-2.5 py-2">
                            <ChannelAutoSyncToggle
                              channelId={channel.id}
                              enabled={channel.autoSyncEnabled ?? true}
                            />
                          </div>
                        ) : null}
                      </ChannelActionsMenu>
                    }
                    className="!mb-0 !border-0 !bg-transparent !p-0"
                  />
                  <ChannelEconomicsSummary
                    channel={channel}
                    currencySettings={currencySettings}
                  />
                  {!hasAdminLink ? (
                    <ExternalChannelAdAnalysis
                      channel={channel}
                      onEdit={(analysis) =>
                        setAnalysisEditor({ channel, analysis })
                      }
                      onDelete={(analysis) =>
                        setDeletingAnalysis({ channel, analysis })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </MasonryGrid>
          {!channelsInitialLoading &&
          !channelsInitialError &&
          !filteredChannels.length ? (
            <EmptyState text={emptyText} />
          ) : null}
        </>
      ) : tab === "networks" ? (
        <TelegramNetworksSection
          networks={networks}
          loading={networksLoading}
          error={networksError}
          moneySettings={currencySettings}
          rates={rates}
          onEdit={(network) => {
            setEditingNetwork(network);
            setNetworkFormOpen(true);
          }}
          onDelete={setDeletingNetwork}
        />
      ) : tab === "accounts" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["mtproto", "people"] as AccountFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${accountFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "accounts", accountFilter: item })
                }
              >
                {item === "mtproto" ? "MTProto" : "People"}
              </button>
            ))}
          </div>
          {accountFilter === "mtproto" ? (
            <MtprotoAccountsPanel
              createOpen={mtprotoCreateOpen}
              onCreateClose={() => setMtprotoCreateOpen(false)}
            />
          ) : null}
          {accountFilter === "people" ? (
            <>
              {peopleInitialLoading ? <LoadingState /> : null}
              {peopleInitialError ? (
                <div className="text-red-300">Failed to load people</div>
              ) : null}
              <TelegramPeopleCards
                people={people || []}
                onDelete={(person) =>
                  setDeletingPerson(person as AdvertisingChannel)
                }
              />
              {!peopleInitialLoading &&
              !peopleInitialError &&
              !(people || []).length ? (
                <EmptyState text="No people" />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <ImportChannelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={(input) => importMutation.mutate({ input, mode: "import" })}
        isSubmitting={importMutation.isPending}
      />
      <ExportChannelsModal
        open={exportOpen}
        channels={channels || []}
        defaultChannelIds={filteredChannels.map((channel) => channel.id)}
        isSubmitting={exporting}
        onClose={() => setExportOpen(false)}
        onSubmit={handleExport}
      />
      <ChannelSyncScopeModal
        open={!!syncTargetChannel}
        title={
          syncTargetChannel ? `Sync ${syncTargetChannel.title}` : "Sync channel"
        }
        description="Choose what to sync for this channel."
        helperText="Sync selected saves this scope to the channel. Sync all runs the full sync without changing the saved scope."
        selection={syncSelection}
        isSyncing={syncNowMutation.isPending}
        submitLabel="Sync selected"
        onClose={() => setSyncTargetChannel(null)}
        onSelectionChange={setSyncSelection}
        onSyncAll={() =>
          syncTargetChannel
            ? syncNowMutation.mutate({
                channel: syncTargetChannel,
                payload: { ...DEFAULT_CHANNEL_SYNC_SELECTION },
              })
            : undefined
        }
        onSubmit={() =>
          syncTargetChannel
            ? syncNowMutation.mutate({
                channel: syncTargetChannel,
                payload: { ...syncSelection, saveSelection: true },
              })
            : undefined
        }
      />
      <WorkspaceChannelSyncModal
        open={workspaceSyncOpen}
        onClose={() => setWorkspaceSyncOpen(false)}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.title ?? ""}
        description="This deletes the channel and related campaigns, promos, invite links, and stats."
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? deleteMutation.mutateAsync(deleting.id) : undefined
        }
        label="Delete"
      />
      <ConfirmDeleteModal
        open={!!deletingPerson}
        entityName={deletingPerson?.title ?? ""}
        description="This deletes the person from advertising sources."
        onClose={() => setDeletingPerson(null)}
        onConfirm={() =>
          deletingPerson
            ? deletePersonMutation.mutateAsync(deletingPerson.id)
            : undefined
        }
        label="Delete"
      />
      <NetworkFormModal
        open={networkFormOpen}
        network={editingNetwork}
        channels={ownChannels}
        isSubmitting={
          createNetworkMutation.isPending || updateNetworkMutation.isPending
        }
        onClose={() => {
          setNetworkFormOpen(false);
          setEditingNetwork(null);
        }}
        onSubmit={(payload) => {
          if (editingNetwork) {
            const networkId = editingNetwork.id;
            setNetworkFormOpen(false);
            setEditingNetwork(null);
            updateNetworkMutation.mutate({ id: networkId, payload });
          } else {
            setNetworkFormOpen(false);
            createNetworkMutation.mutate({
              name: payload.name!,
              description: payload.description,
              iconId: payload.iconId,
              telegramChannelIds: payload.telegramChannelIds!,
            });
          }
        }}
      />
      <ConfirmDeleteModal
        open={!!deletingNetwork}
        entityName={deletingNetwork?.name ?? ""}
        description="This deletes only the network. Telegram channels remain untouched."
        onClose={() => setDeletingNetwork(null)}
        onConfirm={() =>
          deletingNetwork
            ? deleteNetworkMutation.mutateAsync(deletingNetwork.id)
            : undefined
        }
        label="Delete"
      />
      <AdAnalysisModal
        open={!!analysisEditor}
        channel={analysisEditor?.channel}
        analysis={analysisEditor?.analysis}
        currencies={currencySettings?.supportedCurrencies ?? []}
        isSubmitting={saveAnalysisMutation.isPending}
        onClose={() => setAnalysisEditor(null)}
        onSubmit={(payload) => {
          if (!analysisEditor) return;
          saveAnalysisMutation.mutate({
            channelId: analysisEditor.channel.id,
            analysisId: analysisEditor.analysis?.id,
            payload,
          });
        }}
      />
      <ConfirmDeleteModal
        open={!!deletingAnalysis}
        entityName={deletingAnalysis?.channel.title ?? ""}
        description="This deletes only this ad analysis. The Telegram channel and its data remain untouched."
        onClose={() => setDeletingAnalysis(null)}
        onConfirm={() => {
          if (!deletingAnalysis) return;
          return deleteAnalysisMutation.mutateAsync({
            channelId: deletingAnalysis.channel.id,
            analysisId: deletingAnalysis.analysis.id,
          });
        }}
        label="Delete analysis"
      />
    </AppShell>
  );
}

type AdAnalysisFormValues = {
  price?: number;
  currency?: string;
  analyzedAt: string;
  status: "APPROVED" | "REJECTED";
  notes?: string;
  assignedMemberId?: string | null;
};

function MultiImageUpload({
  value,
  onChange,
  disabled,
  onUploadingChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  onUploadingChange: (uploading: boolean) => void;
}) {
  return (
    <FormField label="Images">
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/50 px-4 py-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <ImagePlus size={18} />
        Upload images
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          onChange={async (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (!files.length) return;
            onUploadingChange(true);
            try {
              const uploaded = await Promise.all(
                files.map((file) => iconsApi.upload(file)),
              );
              onChange([...value, ...uploaded.map((item) => item.imageUrl)]);
            } finally {
              onUploadingChange(false);
            }
          }}
        />
      </label>
      {value.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() =>
                  onChange(value.filter((_, itemIndex) => itemIndex !== index))
                }
                className="absolute right-1 top-1 rounded-md bg-black/75 p-1 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Remove image"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </FormField>
  );
}

function AdAnalysisModal({
  open,
  channel,
  analysis,
  currencies,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channel?: TelegramChannel;
  analysis?: TelegramChannelAdAnalysis;
  currencies: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TelegramChannelAdAnalysisPayload) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AdAnalysisFormValues>();
  useEffect(() => {
    if (!open) return;
    const existingStatus =
      analysis?.status === "REJECTED" ? "REJECTED" : "APPROVED";
    reset({
      price: analysis?.price == null ? undefined : Number(analysis.price),
      currency: analysis?.currency || "",
      analyzedAt: analysis?.analyzedAt
        ? formatLocalDate(analysis.analyzedAt)
        : formatLocalDate(new Date()),
      status: existingStatus,
      notes: analysis?.notes || "",
      assignedMemberId: analysis?.assignedMemberId,
    });
  }, [analysis, open, reset]);
  const currencyOptions = Array.from(
    new Set([analysis?.currency, ...currencies].filter(Boolean) as string[]),
  ).sort();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${analysis ? "Edit analysis" : "Analyze"} ${channel?.title || "channel"}`}
      allowOverflow
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) =>
          onSubmit({
            ...values,
            price:
              values.price == null || Number.isNaN(values.price)
                ? undefined
                : values.price,
            currency: values.currency?.toUpperCase() || undefined,
            postLimit: 20,
          }),
        )}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Price">
            <Input
              type="number"
              min="0"
              step="0.01"
              {...register("price", { valueAsNumber: true })}
            />
          </FormField>
          <FormField label="Currency">
            <CurrencySelect
              value={watch("currency") || ""}
              currencies={currencyOptions}
              onChange={(value) =>
                setValue("currency", value, { shouldDirty: true })
              }
            />
          </FormField>
          <FormField label="Status">
            <Select {...register("status")}>
              <option value="APPROVED" className="text-emerald-300">
                Approved
              </option>
              <option value="REJECTED" className="text-rose-300">
                Rejected
              </option>
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Date"
            required
            error={errors.analyzedAt ? "Date is required" : undefined}
          >
            <Controller
              name="analyzedAt"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <DateInput
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder="Select date"
                />
              )}
            />
          </FormField>
          <FormField label="Member">
            <MemberSelect
              value={watch("assignedMemberId")}
              onChange={(assignedMemberId) =>
                setValue("assignedMemberId", assignedMemberId || null)
              }
              defaultToCurrent={!analysis}
            />
          </FormField>
        </div>
        <FormField label="Notes">
          <Textarea rows={3} {...register("notes")} />
        </FormField>
        <p className="text-xs text-slate-500">
          Average views, reactions, forwards and CPM are calculated from the
          latest 20 Telegram posts.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save analysis"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TelegramNetworksSection({
  networks,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  loading: boolean;
  error: unknown;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load networks.
        </div>
      ) : null}
      {!loading && !error && !networks.length ? (
        <EmptyState text="No channel networks yet." />
      ) : null}
      {networks.length ? (
        <TelegramNetworkCards
          networks={networks}
          moneySettings={moneySettings}
          rates={rates}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function NetworkFormModal({
  open,
  network,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  network: TelegramChannelNetwork | null;
  channels: TelegramChannel[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name?: string;
    description?: string | null;
    iconId?: string | null;
    telegramChannelIds?: string[];
    excludedTelegramChannelIds?: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconId, setIconId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(network?.name || "");
    setDescription(network?.description || "");
    setIconId(network?.iconId || null);
    setSelectedIds(
      network?.isSystem
        ? network.excludedTelegramChannelIds || []
        : network?.channels.map((channel) => channel.id) || [],
    );
    setError("");
  }, [channels, network, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const submit = () => {
    if (network?.isSystem) {
      onSubmit({
        excludedTelegramChannelIds: selectedIds,
      });
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Network must contain at least 2 channels.");
      return;
    }
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      iconId,
      telegramChannelIds: selectedIds,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        network?.isSystem
          ? "Configure All network"
          : network
            ? "Edit network"
            : "Create network"
      }
    >
      <div className="space-y-4">
        {!network?.isSystem ? (
          <>
            <FormField label="Emoji">
              <IconPicker
                iconId={iconId}
                icon={network?.iconPresentation}
                onChange={setIconId}
                allowImages={false}
                buttonLabel="Choose network emoji"
              />
            </FormField>
            <FormField label="Name" required>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            Select test or internal channels that must not be included in the
            All network or its aggregated analytics.
          </p>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            {network?.isSystem ? "Channels excluded from All" : "Channels"}
          </p>
          {network?.isSystem ? (
            <MultiSelect
              value={selectedIds}
              onChange={setSelectedIds}
              options={channels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl || undefined,
                iconFallback: channel.title.slice(0, 1).toUpperCase(),
              }))}
              placeholder="No channels excluded"
              searchPlaceholder="Search channels..."
              allSelectedLabel="All channels excluded"
            />
          ) : (
            <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
              {channels.map((channel) => (
                <ChannelSelectRow
                  key={channel.id}
                  channel={channel}
                  checked={selectedSet.has(channel.id)}
                  onToggle={() => toggleChannel(channel.id)}
                />
              ))}
              {!channels.length ? (
                <p className="p-2 text-sm text-slate-400">
                  No own channels available.
                </p>
              ) : null}
            </div>
          )}
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelSelectRow({
  channel,
  checked,
  onToggle,
}: {
  channel: TelegramChannel;
  checked: boolean;
  onToggle: () => void;
}) {
  const username = channel.username
    ? `@${String(channel.username).replace(/^@/, "")}`
    : "";
  return (
    <label
      className={`flex items-center gap-3 rounded-md border p-2 text-sm transition ${
        checked
          ? "border-blue-700 bg-slate-900"
          : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <TelegramEntityAvatar
        imageUrl={channel.photoUrl}
        kind="channel"
        alt={channel.title}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight text-slate-100">
          {channel.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {telegramChannelAccessLabel(channel.accessMode)}
        </p>
        {username ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">{username}</p>
        ) : null}
      </div>
    </label>
  );
}

function ImportChannelModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: string) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ input: string }>({ defaultValues: { input: "" } });
  return (
    <Modal open={open} onClose={onClose} title="Import">
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => {
          onSubmit(values.input);
          reset({ input: "" });
        })}
      >
        <FormField
          label="Username, Telegram link, invite link or exact title"
          required
          error={errors.input ? "Required field" : undefined}
        >
          <Input
            placeholder="@channel, https://t.me/channel, https://t.me/+invite or Channel title"
            {...register("input", {
              required: true,
              validate: (value) =>
                String(value || "").trim().length > 0 || "Required field",
              maxLength: 300,
            })}
          />
        </FormField>
        <p className="text-xs leading-5 text-slate-400">
          Private invite links may join the channel using the connected Telegram
          account. Private channels cannot be found by title unless the account
          already has access.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ExportChannelsModal({
  open,
  channels,
  defaultChannelIds,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  channels: TelegramChannel[];
  defaultChannelIds: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (channelIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(
      defaultChannelIds.length
        ? defaultChannelIds
        : channels.map((channel) => channel.id),
    );
  }, [channels, defaultChannelIds, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    channels.length > 0 && selectedIds.length === channels.length;
  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : channels.map((channel) => channel.id));
  };

  return (
    <Modal open={open} onClose={onClose} title="Export channels">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            One Excel file will be downloaded for each selected channel.
          </p>
          <Button type="button" variant="secondary" onClick={toggleAll}>
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </div>
        <div className="max-h-96 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
          {channels.map((channel) => (
            <ChannelSelectRow
              key={channel.id}
              channel={channel}
              checked={selectedSet.has(channel.id)}
              onToggle={() => toggleChannel(channel.id)}
            />
          ))}
          {!channels.length ? (
            <p className="p-2 text-sm text-slate-400">
              No channels available for export.
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Selected: {formatNumber(selectedIds.length)}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting || !selectedIds.length}
              onClick={() => onSubmit(selectedIds)}
            >
              {isSubmitting ? "Exporting..." : "Export"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
