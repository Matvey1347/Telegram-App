"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

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
  return `${number(value, digits)} ${currency}`;
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

type EconomicsEditorProps = {
  channel: TelegramChannel;
  currencies: string[];
  onClose: () => void;
};

function EconomicsEditor({
  channel,
  currencies,
  onClose,
}: EconomicsEditorProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [cpm, setCpm] = useState(
    channel.adBaseCpm == null ? "" : String(channel.adBaseCpm),
  );
  const [currency, setCurrency] = useState(
    channel.adBaseCurrency || channel.kpiCurrency || "USD",
  );
  const [targetCpa, setTargetCpa] = useState(
    channel.targetCpa == null ? "" : String(channel.targetCpa),
  );
  const [normalCpaUpTo, setNormalCpaUpTo] = useState(
    channel.stopCpaFrom == null ? "" : String(channel.stopCpaFrom),
  );
  const update = useMutation({
    mutationFn: () =>
      telegramChannelsApi.updateQuiet(channel.id, {
        adBaseCpm: cpm.trim() === "" ? null : Number(cpm),
        adBaseCurrency: currency,
        kpiCurrency: currency,
        targetCpa: targetCpa.trim() === "" ? null : Number(targetCpa),
        stopCpaFrom: normalCpaUpTo.trim() === "" ? null : Number(normalCpaUpTo),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.lists(),
      });
      pushToast("Channel economics updated", "success");
      onClose();
    },
    onError: () => pushToast("Could not update channel economics", "error"),
  });
  const invalidNumber = [cpm, targetCpa, normalCpaUpTo].some(
    (value) =>
      value.trim() !== "" &&
      (!Number.isFinite(Number(value)) || Number(value) < 0),
  );
  const invalidKpiRange =
    targetCpa.trim() !== "" &&
    normalCpaUpTo.trim() !== "" &&
    Number(targetCpa) >= Number(normalCpaUpTo);

  return (
    <Modal open onClose={onClose} title={`Economics · ${channel.title}`}>
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">
          One currency is used for CPM, purchase payback and KPI. KPI is CPA per
          subscriber: lower is better.
        </p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.32fr)]">
          <FormField label="Ad CPM">
            <Input
              inputMode="decimal"
              value={cpm}
              onChange={(event) => setCpm(event.target.value)}
              placeholder="Not set"
            />
          </FormField>
          <FormField label="Currency">
            <CustomSelect
              value={currency}
              onChange={setCurrency}
              options={currencies.map((currency) => ({
                value: currency,
                label: currency,
              }))}
              searchable={false}
            />
          </FormField>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-sm font-medium text-white">KPI limits</p>
          <p className="mt-1 text-xs text-neutral-400">
            CPA up to the first value is good. Between the first and second is
            normal. Above the second is bad.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField label="Good — CPA up to">
              <Input
                inputMode="decimal"
                value={targetCpa}
                onChange={(event) => setTargetCpa(event.target.value)}
                placeholder="Optional"
              />
            </FormField>
            <FormField label="Normal — CPA up to">
              <Input
                inputMode="decimal"
                value={normalCpaUpTo}
                onChange={(event) => setNormalCpaUpTo(event.target.value)}
                placeholder="Optional"
              />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => update.mutate()}
            disabled={update.isPending || invalidNumber || invalidKpiRange}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ChannelEconomicsSummary({
  channel,
  currencySettings,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
}) {
  const [editing, setEditing] = useState(false);
  const economics = channel.preview?.financialSummary.assetEconomics;
  const audience = channel.preview?.audience;
  const currencies = useMemo(
    () =>
      Array.from(
        new Set(
          [
            economics?.currency,
            channel.adBaseCurrency,
            channel.kpiCurrency,
            currencySettings?.primaryCurrency,
            ...(currencySettings?.supportedCurrencies ?? []),
          ].filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [
      channel.adBaseCurrency,
      channel.kpiCurrency,
      currencySettings,
      economics?.currency,
    ],
  );
  const currency =
    economics?.currency ||
    channel.adBaseCurrency ||
    currencySettings?.primaryCurrency ||
    "USD";
  const formatPricing = economics?.formatPricing;

  return (
    <>
      <section className="mt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Channel economics
            </p>
            <span className="text-neutral-700">·</span>
            <p className="text-xs text-neutral-500">{currency}</p>
          </div>
          <span className="group relative inline-flex">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-white"
              aria-label={`Edit economics for ${channel.title}`}
            >
              <Settings2 size={15} /> Edit
            </button>
            <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-max rounded bg-neutral-950 px-2 py-1 text-xs text-white shadow group-hover:block">
              Edit CPM and KPI
            </span>
          </span>
        </div>
        {economics?.conversionUnavailable ? (
          <p className="mt-3 rounded-md border border-amber-900/70 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-200">
            Some revenue cannot be converted to {currency}; add the missing
            exchange rate.
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
              <Metric
                label="Bought for"
                value={
                  economics?.purchasePrice == null
                    ? "Not recorded"
                    : moneyOrDash(economics.purchasePrice, currency)
                }
                tone="text-rose-300"
              />
              <Metric
                label="Ad spend"
                value={moneyOrDash(economics?.adSpend, currency)}
                tone="text-rose-300"
              />
              <Metric
                label="Earned"
                value={moneyOrDash(economics?.revenue, currency)}
                tone="text-emerald-300"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
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
                label="3/72"
                pricing={formatPricing?.h72}
                currency={formatPricing?.currency || currency}
              />
              <FormatPrice
                label="No delete"
                pricing={formatPricing?.permanent}
                currency={formatPricing?.currency || currency}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="text-neutral-500">Payback</span>
              <span className="font-semibold text-white">
                {economics?.paybackPercent == null
                  ? "—"
                  : percent(economics.paybackPercent)}
              </span>
              <span className="text-neutral-400">
                {economics?.remainingToBreakEven == null
                  ? "Costs or revenue missing"
                  : economics.remainingToBreakEven === 0
                    ? "Investment recovered"
                    : `${money(economics.remainingToBreakEven, currency)} remaining`}
              </span>
              {channel.adBaseCpm != null ? (
                <span className="ml-auto text-neutral-500">
                  CPM{" "}
                  {money(
                    channel.adBaseCpm,
                    channel.adBaseCurrency || currency,
                    2,
                  )}
                </span>
              ) : null}
              {economics?.estimatedAdsRemaining != null ? (
                <span className="text-neutral-400">
                  · {economics.estimatedAdsRemaining} ads to break even
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-neutral-800/70 pt-2 text-xs">
              <span className="text-neutral-500">Audience</span>
              <span className="font-medium text-neutral-200">
                {number(
                  audience?.subscribersCount ?? channel.currentSubscribersCount,
                )}{" "}
                subscribers · {number(audience?.viewRate, 1)}% views
              </span>
            </div>
          </>
        )}
      </section>
      {editing ? (
        <EconomicsEditor
          channel={channel}
          currencies={currencies}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-300">{label}</span>
        <span className="text-xs font-semibold text-sky-200">
          {moneyOrDash(pricing?.estimatedPrice, currency, 1)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
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
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
