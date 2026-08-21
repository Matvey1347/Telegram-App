"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
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
          <FormField label="Currency for all economics">
            <Select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="min-w-[150px]"
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
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
  const estimatedPrice = economics?.estimatedAdPrice;

  return (
    <>
      <section className="mt-3 border-t border-neutral-800 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Channel economics
            </p>
            <p className="mt-0.5 text-sm text-neutral-400">
              All figures in {currency}
            </p>
          </div>
          <span className="group relative inline-flex">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 px-2 text-xs font-medium text-neutral-300 hover:border-neutral-500 hover:text-white"
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
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric
                label="Bought for"
                value={
                  economics?.purchasePrice == null
                    ? "Not recorded"
                    : money(economics.purchasePrice, currency)
                }
                tone="text-rose-300"
              />
              <Metric
                label="Ad spend"
                value={
                  economics?.adSpend == null
                    ? "—"
                    : money(economics.adSpend, currency)
                }
                tone="text-rose-300"
              />
              <Metric
                label="Earned"
                value={
                  economics?.revenue == null
                    ? "—"
                    : money(economics.revenue, currency)
                }
                tone="text-emerald-300"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-neutral-950/70 p-2.5">
              <div>
                <p className="text-xs text-neutral-500">Payback</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {economics?.paybackPercent == null
                    ? "—"
                    : percent(economics.paybackPercent)}
                </p>
                <p className="text-xs text-neutral-400">
                  {economics?.remainingToBreakEven == null
                    ? "Set costs and revenue"
                    : economics.remainingToBreakEven === 0
                      ? "Investment recovered"
                      : `${money(economics.remainingToBreakEven, currency)} remaining`}
                </p>
              </div>
              <div className="border-l border-neutral-800 pl-2.5">
                <p className="text-xs text-neutral-500">CPM / ad price</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {channel.adBaseCpm == null
                    ? "CPM not set"
                    : `CPM ${money(channel.adBaseCpm, channel.adBaseCurrency || currency, 2)}`}
                </p>
                <p className="text-xs text-neutral-400">
                  {estimatedPrice == null
                    ? "Set average views for ad-price forecast"
                    : `${money(estimatedPrice, currency)} · ${economics?.estimatedAdsRemaining ?? "—"} ads to break even`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
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
      <p className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
