"use client";

import type { ReactNode } from "react";
import {
  CalendarCheck2,
  Eye,
  FilePenLine,
  Megaphone,
  Percent,
  UserCheck,
  UserRound,
} from "lucide-react";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import { Tooltip } from "@/components/ui/primitives";
import { getChannelBookingIndicator } from "./channel-booking-indicator";

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "—";
}

function money(value: unknown, currency: string, digits = 0) {
  const formatted = number(value, digits).replace(/,/g, ".");
  return `${formatted} ${currency}`;
}

function moneyOrDash(value: unknown, currency: string, digits = 0) {
  const parsed = Number(value);
  return value == null || !Number.isFinite(parsed) || parsed === 0
    ? "—"
    : money(parsed, currency, digits);
}

function percent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${number(parsed, 0)}%` : "—";
}

function channelScale(channel: TelegramChannel) {
  const value = Number(
    channel.preview?.audience?.subscribersCount ??
      channel.currentSubscribersCount ??
      0,
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function sortChannelsByScale(channels: TelegramChannel[]) {
  return [...channels].sort(
    (left, right) =>
      channelScale(right) - channelScale(left) ||
      left.title.localeCompare(right.title),
  );
}

function isMeaningfulAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) >= 0.01;
}

export function hasMeaningfulChannelEconomics(channel: TelegramChannel) {
  const economics = channel.preview?.financialSummary.assetEconomics;
  const prices = economics?.formatPricing;
  return Boolean(
    economics?.conversionUnavailable ||
    isMeaningfulAmount(channel.adBaseCpm) ||
    isMeaningfulAmount(economics?.invested) ||
    isMeaningfulAmount(economics?.purchasePrice) ||
    isMeaningfulAmount(economics?.adSpend) ||
    isMeaningfulAmount(economics?.revenue) ||
    isMeaningfulAmount(economics?.remainingToBreakEven) ||
    isMeaningfulAmount(economics?.estimatedAdPrice) ||
    isMeaningfulAmount(prices?.h24?.estimatedPrice) ||
    isMeaningfulAmount(prices?.h48?.estimatedPrice) ||
    isMeaningfulAmount(prices?.permanent?.estimatedPrice),
  );
}

export function ChannelEconomicsSummary({
  channel,
  currencySettings,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
}) {
  const economics = channel.preview?.financialSummary.assetEconomics;
  const hasEconomics = hasMeaningfulChannelEconomics(channel);
  const financialSummary = channel.preview?.financialSummary;
  const audience = channel.preview?.audience;
  const currency =
    economics?.currency ||
    channel.adBaseCurrency ||
    currencySettings?.primaryCurrency ||
    "USD";
  const formatPricing = economics?.formatPricing;
  const invested = positiveAmount(economics?.invested);
  const subscribersCount = positiveAmount(
    audience?.subscribersCount ?? channel.currentSubscribersCount,
  );
  const pendingSubscribers = positiveAmount(
    financialSummary?.totalPendingSubscribers,
  );
  const subscriberCostBase = subscribersCount + pendingSubscribers;
  const activeSubscribers = positiveAmount(
    financialSummary?.activeSubscribersEstimate ??
      audience?.activeSubscribersEstimate,
  );
  const regularCpa =
    invested > 0 && subscriberCostBase > 0 ? invested / subscriberCostBase : 0;
  const activeCpa =
    invested > 0 && activeSubscribers > 0 ? invested / activeSubscribers : 0;
  const booking = getChannelBookingIndicator(channel.preview?.bookingSchedule);
  const draftTotal = channel.preview?.bookingSchedule?.draftTotal ?? 0;

  const operationalStatus = (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-neutral-400">
      <span
        className={`inline-flex items-center gap-1.5 ${booking.tone}`}
        title="Booked through"
      >
        <CalendarCheck2 size={14} aria-label="Booked through" />
        {booking.compactLabel}
      </span>
      <span className="inline-flex items-center gap-1.5" title="Drafts">
        <FilePenLine size={14} className="text-sky-300" aria-label="Drafts" />
        <strong className="font-semibold text-white">{draftTotal}</strong>
      </span>
    </span>
  );

  return (
    <section className="mt-2">
      {!hasEconomics ? (
        <div className="flex justify-end border-t border-neutral-800/80 pt-2 text-xs">
          {operationalStatus}
        </div>
      ) : economics?.conversionUnavailable ? (
        <>
          <p className="mt-3 rounded-md border border-amber-900/70 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-200">
            Some revenue cannot be converted to {currency}; add the missing
            exchange rate.
          </p>
          <div className="mt-2 flex justify-end text-xs">
            {operationalStatus}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-start sm:justify-between">
            <SpendMetric
              purchasePrice={economics?.purchasePrice}
              adSpend={economics?.adSpend}
              currency={currency}
            />
            <SubscriberCost
              label="Sub"
              value={moneyOrDash(regularCpa, currency, 1)}
              icon={<UserRound size={14} className="text-violet-300" />}
            />
            <SubscriberCost
              label="Active"
              value={moneyOrDash(activeCpa, currency, 1)}
              icon={<UserCheck size={14} className="text-emerald-300" />}
            />
            <Metric
              label="Earned"
              value={moneyOrDash(economics?.revenue, currency)}
              tone="text-emerald-300"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {channel.adBaseCpm != null ? (
              <span className="text-neutral-500">
                CPM{" "}
                {money(
                  channel.adBaseCpm,
                  channel.adBaseCurrency || currency,
                  2,
                )}
              </span>
            ) : (
              <span />
            )}
            {operationalStatus}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <FormatPrice
              label="1/24"
              pricing={formatPricing?.h24}
              currency={formatPricing?.currency || currency}
            />
            <FormatPrice
              label="2/48"
              pricing={formatPricing?.h48}
              currency={formatPricing?.currency || currency}
            />
            <FormatPrice
              label="No delete"
              pricing={formatPricing?.permanent}
              currency={formatPricing?.currency || currency}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-2">
              <Percent size={14} className="text-teal-300" aria-hidden="true" />
              <span className="text-neutral-500">Payback</span>
              <span className="font-semibold text-white">
                {economics?.paybackPercent == null
                  ? "—"
                  : percent(economics.paybackPercent)}
              </span>
              {economics?.remainingToBreakEven === 0 ? (
                <span className="text-emerald-300">Investment recovered</span>
              ) : null}
            </span>
            {economics?.estimatedAdsRemaining != null ? (
              <span className="inline-flex items-center gap-1.5 text-neutral-400">
                <Megaphone
                  size={14}
                  className="text-amber-300"
                  aria-hidden="true"
                />
                <strong className="font-semibold text-white">
                  {economics.estimatedAdsRemaining}
                </strong>{" "}
                ads to break even
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function SubscriberCost({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="flex h-5 min-w-0 items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <p className="flex h-6 items-center truncate text-sm font-semibold leading-none text-neutral-200">
        {value}
      </p>
    </div>
  );
}

function positiveAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function SpendMetric({
  purchasePrice,
  adSpend,
  currency,
}: {
  purchasePrice?: number | null;
  adSpend?: number | null;
  currency: string;
}) {
  const purchaseAmount = positiveAmount(purchasePrice);
  const adSpendAmount = positiveAmount(adSpend);
  const total = purchaseAmount + adSpendAmount;

  if (total === 0) {
    return <Metric label={<ExpenseLabel />} value="—" tone="text-rose-300" />;
  }

  return (
    <div className="min-w-0">
      <ExpenseLabel />
      <div className="flex h-6 items-center">
        <Tooltip
          side="bottom"
          align="left"
          className="h-full w-fit items-center"
          content={
            <span className="grid min-w-44 gap-1.5">
              {purchaseAmount > 0 ? (
                <span className="flex items-center justify-between gap-4">
                  <span className="text-neutral-400">Bought for</span>
                  <span className="font-medium">
                    {money(purchaseAmount, currency)}
                  </span>
                </span>
              ) : null}
              {adSpendAmount > 0 ? (
                <span className="flex items-center justify-between gap-4">
                  <span className="text-neutral-400">Ad spend</span>
                  <span className="font-medium">
                    {money(adSpendAmount, currency)}
                  </span>
                </span>
              ) : null}
            </span>
          }
        >
          <button
            type="button"
            className="flex h-full items-center text-left text-sm font-semibold leading-none text-rose-300"
            aria-label="Show spend breakdown"
          >
            {money(total, currency)}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function ExpenseLabel() {
  return (
    <span className="flex h-5 items-center text-xs text-neutral-500">
      Spend
    </span>
  );
}

function FormatPrice({
  label,
  pricing,
  currency,
}: {
  label: string;
  pricing?: {
    expectedViews: number | null;
    estimatedPrice: number | null;
  };
  currency: string;
}) {
  return (
    <div className="rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2.5 py-2">
      <div className="space-y-1">
        <p className="text-xs font-medium text-neutral-300">{label}</p>
        <p className="text-xs font-semibold text-white">
          {moneyOrDash(pricing?.estimatedPrice, currency, 1)}
        </p>
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <Eye size={13} className="text-sky-300" aria-hidden="true" />
        {pricing?.expectedViews != null
          ? `${number(pricing.expectedViews)} views`
          : "Not enough data"}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "text-white",
}: {
  label: ReactNode;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex h-5 items-center text-xs text-neutral-500">{label}</p>
      <p
        className={`flex h-6 items-center truncate text-sm font-semibold leading-none ${tone}`}
      >
        {value}
      </p>
    </div>
  );
}
