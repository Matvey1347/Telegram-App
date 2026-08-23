"use client";

import Link from "next/link";
import {
  Eye,
  Megaphone,
  Pencil,
  Percent,
  Smile,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  CurrencySettings,
  TelegramChannelNetwork,
  TelegramChannelNetworkMember,
} from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { formatMoney } from "@/lib/features/finance/money";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "./telegram-card-actions-menu";

function number(value: unknown, decimals = 0) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      })
    : "—";
}

function percent(value: unknown) {
  return value == null ? "—" : `${number(value, 1)}%`;
}

function money(
  amount: number | null | undefined,
  currency: string | null | undefined,
  settings?: CurrencySettings | null,
) {
  return amount == null
    ? "—"
    : formatMoney(
        amount,
        currency || settings?.primaryCurrency,
        settings?.currencyDisplayMode,
      );
}

function positiveAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function Metric({
  icon,
  label,
  value,
  tone = "text-white",
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex h-5 items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <div className={`flex h-6 items-center truncate font-semibold ${tone}`}>
        {value}
      </div>
    </div>
  );
}

function NetworkChannels({
  channels,
}: {
  channels: TelegramChannelNetworkMember[];
}) {
  const visible = channels.slice(0, 3);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {visible.length ? (
        <div className="flex -space-x-2">
          {visible.map((channel) => (
            <Link
              key={channel.id}
              href={`/telegram/channels/${channel.id}`}
              title={channel.title}
              className="rounded-full ring-2 ring-neutral-900 transition hover:z-10 hover:ring-blue-500"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                kind="channel"
                alt={channel.title}
                size="sm"
              />
            </Link>
          ))}
        </div>
      ) : null}
      <span className="truncate text-xs text-neutral-500">
        {channels.length} {channels.length === 1 ? "channel" : "channels"}
      </span>
    </div>
  );
}

function FormatPrice({
  label,
  pricing,
  currency,
  settings,
}: {
  label: string;
  pricing?: { expectedViews: number | null; estimatedPrice: number | null };
  currency?: string | null;
  settings?: CurrencySettings | null;
}) {
  return (
    <div className="rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2.5 py-2">
      <p className="text-xs font-medium text-neutral-300">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-white">
        {money(pricing?.estimatedPrice, currency, settings)}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
        <Eye size={13} className="text-sky-300" aria-hidden="true" />
        {pricing?.expectedViews != null
          ? `${number(pricing.expectedViews)} views`
          : "Not enough data"}
      </p>
    </div>
  );
}

export function TelegramNetworkCard({
  network,
  moneySettings,
  iconPickerKey,
  iconUpdating,
  onIconChange,
  onEdit,
  onDelete,
}: {
  network: TelegramChannelNetwork;
  moneySettings?: CurrencySettings | null;
  iconPickerKey: string;
  iconUpdating: boolean;
  onIconChange: (iconId: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const summary = network.summary;
  const economics = summary.assetEconomics;
  const economicsCurrency = economics?.currency || summary.currency;
  const pricing = economics?.formatPricing;
  const invested = positiveAmount(economics?.invested);
  const subscriberBase =
    positiveAmount(summary.totalSubscribers) +
    positiveAmount(summary.totalPendingSubscribers);
  const activeSubscribers = positiveAmount(summary.activeSubscribersEstimate);
  const pendingJoinRequests = positiveAmount(summary.pendingJoinRequestsCount);
  const subscriberCost =
    invested > 0 && subscriberBase > 0 ? invested / subscriberBase : null;
  const activeCost =
    invested > 0 && activeSubscribers > 0 ? invested / activeSubscribers : null;

  return (
    <article className="rounded-xl border border-neutral-800/80 bg-neutral-900/55 p-4 text-sm text-neutral-300">
      <div className="flex items-start gap-3">
        {network.isSystem ? (
          <IconAvatar
            icon={network.iconPresentation}
            label={network.name}
            size="lg"
            bordered={false}
            className="!rounded-full !bg-transparent"
          />
        ) : (
          <IconPicker
            key={iconPickerKey}
            compact
            allowImages={false}
            disabled={iconUpdating}
            iconId={network.iconId}
            icon={network.iconPresentation}
            onChange={onIconChange}
            buttonLabel="Choose network emoji"
            ariaLabel={`Choose emoji for ${network.name}`}
            className="shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/telegram-channel-networks/${network.id}`}
              className="truncate text-lg font-semibold leading-tight text-white hover:text-blue-300"
            >
              {network.name}
            </Link>
            {network.isSystem ? (
              <span className="rounded border border-sky-700/80 bg-sky-950/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
                System
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-start gap-1.5 text-sm text-neutral-400">
            <span className="grid grid-cols-[max-content_14px] items-center gap-x-1.5 gap-y-1">
              <span>{number(summary.totalSubscribers)}</span>
              <Users
                size={14}
                className="text-violet-300"
                aria-label="Audience"
              />
              {pendingJoinRequests > 0 ? (
                <>
                  <strong className="justify-self-end font-semibold text-white">
                    {number(pendingJoinRequests)}
                  </strong>
                  <UserPlus
                    size={14}
                    className="text-amber-300"
                    aria-label="Pending join requests"
                  />
                </>
              ) : null}
            </span>
            <span className="text-neutral-600">/</span>
            <Eye size={14} className="text-sky-300" aria-hidden="true" />
            <span>{percent(summary.viewRate)}</span>
            <span className="text-neutral-600">/</span>
            <Smile
              size={14}
              className="text-amber-300"
              aria-label="Reaction rate"
            />
            <span>{percent(summary.reactionRate)}</span>
          </div>
        </div>
        {!network.isSystem ? (
          <TelegramCardActionsMenu label={`Actions for ${network.name}`}>
            <TelegramCardMenuAction
              label="Edit network"
              icon={<Pencil size={17} />}
              onClick={onEdit}
            />
            <TelegramCardMenuAction
              danger
              label="Delete network"
              icon={<Trash2 size={17} />}
              onClick={onDelete}
            />
          </TelegramCardActionsMenu>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Metric
          label="Spend"
          value={money(economics?.invested, economicsCurrency, moneySettings)}
          tone="text-rose-300"
        />
        <Metric
          icon={
            <UserRound
              size={14}
              className="text-violet-300"
              aria-hidden="true"
            />
          }
          label="Sub"
          value={money(subscriberCost, economicsCurrency, moneySettings)}
        />
        <Metric
          icon={
            <UserCheck
              size={14}
              className="text-emerald-300"
              aria-hidden="true"
            />
          }
          label="Active"
          value={money(activeCost, economicsCurrency, moneySettings)}
        />
        <Metric
          label="Earned"
          value={money(economics?.revenue, economicsCurrency, moneySettings)}
          tone="text-emerald-300"
        />
      </div>

      {pricing ? (
        <>
          <p className="mt-3 text-xs text-neutral-500">
            CPM {money(pricing.cpm, pricing.currency, moneySettings)}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <FormatPrice
              label="1/24"
              pricing={pricing.h24}
              currency={pricing.currency}
              settings={moneySettings}
            />
            <FormatPrice
              label="2/48"
              pricing={pricing.h48}
              currency={pricing.currency}
              settings={moneySettings}
            />
            <FormatPrice
              label="No delete"
              pricing={pricing.permanent}
              currency={pricing.currency}
              settings={moneySettings}
            />
          </div>
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-2">
          <Percent size={14} className="text-teal-300" aria-hidden="true" />
          <span className="text-neutral-500">Payback</span>
          <strong className="font-semibold text-white">
            {percent(economics?.paybackPercent)}
          </strong>
        </span>
        {economics?.estimatedAdsRemaining != null ? (
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <Megaphone
              size={14}
              className="text-amber-300"
              aria-hidden="true"
            />
            <strong className="font-semibold text-white">
              {number(economics.estimatedAdsRemaining)}
            </strong>{" "}
            ads to break even
          </span>
        ) : null}
      </div>

      <div className="mt-4 border-t border-neutral-800 pt-3">
        <NetworkChannels channels={network.channels} />
      </div>
    </article>
  );
}
