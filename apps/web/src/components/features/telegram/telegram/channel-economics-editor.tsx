"use client";

import { useMemo, useState } from "react";
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

export function ChannelEconomicsEditor({
  channel,
  currencySettings,
  onClose,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
  onClose: () => void;
}) {
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
  const economics = channel.preview?.financialSummary.assetEconomics;
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
