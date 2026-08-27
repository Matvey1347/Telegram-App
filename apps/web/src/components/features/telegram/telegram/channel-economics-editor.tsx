"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { TelegramAdProduct } from "@telegram-system/shared";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import { telegramAdSalesApi, telegramChannelsApi } from "@/lib/api";
import {
  Button,
  ConfirmDeleteModal,
  CurrencySelect,
  FormField,
  Input,
  Modal,
  Skeleton,
  ToggleRow,
} from "@/components/ui/primitives";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

const standardFormats = new Set(["1/24", "2/48", "3/72", "1/permanent", "No auto-delete"]);

type FormatDraft = {
  productId?: string;
  name: string;
  topHours: string;
  feedHours: string;
  permanent: boolean;
  active: boolean;
  position: number;
};

function displayName(product: Pick<TelegramAdProduct, "name" | "isPermanent">) {
  return product.isPermanent && product.name.trim() === "1/permanent" ? "No auto-delete" : product.name;
}

function formatDraft(product?: TelegramAdProduct, position = 0): FormatDraft {
  return {
    productId: product?.id,
    name: product?.name ?? "",
    topHours: String(product?.topDurationMinutes ? Math.max(1, Math.round(product.topDurationMinutes / 60)) : 1),
    feedHours: String(product?.feedDurationHours ?? product?.deleteAfterHours ?? 24),
    permanent: product?.isPermanent ?? false,
    active: product?.isActive ?? true,
    position: product?.position ?? position,
  };
}

function delivery(product: TelegramAdProduct) {
  const topHours = product.topDurationMinutes ? Math.max(1, Math.round(product.topDurationMinutes / 60)) : 1;
  return product.isPermanent
    ? `${topHours}h first · no auto-delete`
    : `${topHours}h first · ${product.feedDurationHours ?? product.deleteAfterHours ?? 24}h in feed`;
}

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
  const [cpm, setCpm] = useState(channel.adBaseCpm == null ? "" : String(channel.adBaseCpm));
  const [currency, setCurrency] = useState(channel.adBaseCurrency || channel.kpiCurrency || "USD");
  const [targetCpa, setTargetCpa] = useState(channel.targetCpa == null ? "" : String(channel.targetCpa));
  const [normalCpa, setNormalCpa] = useState(channel.stopCpaFrom == null ? "" : String(channel.stopCpaFrom));
  const [editing, setEditing] = useState<FormatDraft | null>(null);
  const [deleting, setDeleting] = useState<TelegramAdProduct | null>(null);
  const economics = channel.preview?.financialSummary.assetEconomics;
  const currencies = useMemo(() => Array.from(new Set([
    economics?.currency,
    channel.adBaseCurrency,
    channel.kpiCurrency,
    currencySettings?.primaryCurrency,
    ...(currencySettings?.supportedCurrencies ?? []),
  ].filter((value): value is string => Boolean(value)))).sort(), [channel.adBaseCurrency, channel.kpiCurrency, currencySettings, economics?.currency]);
  const setupQuery = useQuery({
    queryKey: telegramAdSalesKeys.channelSetup(channel.id),
    queryFn: () => telegramAdSalesApi.getChannelSetup(channel.id),
    staleTime: 60_000,
  });
  const products = setupQuery.data?.products ?? [];

  const economicsMutation = useMutation({
    mutationFn: () => telegramChannelsApi.updateQuiet(channel.id, {
      adBaseCpm: cpm.trim() ? Number(cpm) : null,
      adBaseCurrency: currency,
      kpiCurrency: currency,
      targetCpa: targetCpa.trim() ? Number(targetCpa) : null,
      stopCpaFrom: normalCpa.trim() ? Number(normalCpa) : null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: telegramChannelKeys.lists() });
      pushToast("Channel economics updated", "success");
      onClose();
    },
    onError: () => pushToast("Could not update channel economics", "error"),
  });
  const formatMutation = useMutation({
    mutationFn: async (operation: { kind: "save"; draft: FormatDraft } | { kind: "toggle"; product: TelegramAdProduct } | { kind: "delete"; product: TelegramAdProduct }) => {
      if (operation.kind === "delete") return telegramAdSalesApi.deactivateProduct(operation.product.id);
      if (operation.kind === "toggle") return telegramAdSalesApi.updateProduct(operation.product.id, { isActive: !operation.product.isActive });
      const draft = operation.draft;
      const feedHours = Math.max(1, Number(draft.feedHours));
      const payload = {
        name: draft.name.trim(),
        defaultPricingMode: "CPM",
        minimumPrice: 0,
        currency,
        isActive: draft.active,
        position: draft.position,
        topDurationMinutes: Math.max(1, Number(draft.topHours)) * 60,
        feedDurationHours: draft.permanent ? null : feedHours,
        deleteAfterHours: draft.permanent ? null : feedHours,
        isPermanent: draft.permanent,
      };
      return draft.productId
        ? telegramAdSalesApi.updateProduct(draft.productId, payload)
        : telegramAdSalesApi.createProduct(channel.id, payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.channelSetup(channel.id) }),
        queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.channelProducts(channel.id) }),
      ]);
      setEditing(null);
      setDeleting(null);
      pushToast("Placement formats updated", "success");
    },
    onError: () => pushToast("Could not update placement formats", "error"),
  });
  const invalidNumber = [cpm, targetCpa, normalCpa].some((value) => value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0));
  const invalidKpi = targetCpa.trim() && normalCpa.trim() && Number(targetCpa) >= Number(normalCpa);
  const invalidFormat = editing && (!editing.name.trim() || Number(editing.topHours) <= 0 || (!editing.permanent && Number(editing.feedHours) <= 0));

  return (
    <>
      <Modal open onClose={onClose} title={`Economics · ${channel.title}`} size="xl">
        <div className="space-y-5">
          <p className="text-sm text-neutral-400">One currency is used for CPM, purchase payback and KPI. KPI is CPA per subscriber: lower is better.</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.32fr)]">
            <FormField label="Ad CPM">
              <Input inputMode="decimal" value={cpm} onChange={(event) => setCpm(event.target.value)} placeholder="Not set" />
            </FormField>
            <FormField label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} currencies={currencies} />
            </FormField>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3">
            <p className="text-sm font-medium text-white">KPI limits</p>
            <p className="mt-1 text-xs text-neutral-400">CPA up to the first value is good. Between the first and second is normal. Above the second is bad.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label="Good — CPA up to">
                <Input inputMode="decimal" value={targetCpa} onChange={(event) => setTargetCpa(event.target.value)} placeholder="Optional" />
              </FormField>
              <FormField label="Normal — CPA up to">
                <Input inputMode="decimal" value={normalCpa} onChange={(event) => setNormalCpa(event.target.value)} placeholder="Optional" />
              </FormField>
            </div>
          </div>

          <section className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-white">Placement formats</h3>
                <p className="text-xs text-neutral-400">Used when selling ads for this channel.</p>
              </div>
              <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => setEditing(formatDraft(undefined, products.length))}>
                <Plus size={15} /> New format
              </Button>
            </div>
            {setupQuery.isLoading ? (
              <div className="mt-3 space-y-2" aria-label="Loading placement formats"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : setupQuery.isError ? (
              <div className="mt-3 flex items-center justify-between rounded-md border border-red-900/60 p-3 text-sm text-red-200">
                <span>Could not load placement formats.</span>
                <Button variant="secondary" onClick={() => void setupQuery.refetch()}>Retry</Button>
              </div>
            ) : products.length ? (
              <div className="mt-3 divide-y divide-neutral-800 overflow-hidden rounded-md border border-neutral-800">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{displayName(product)}</p>
                      <p className="truncate text-xs text-neutral-500">{delivery(product)}</p>
                    </div>
                    <button type="button" disabled={formatMutation.isPending} onClick={() => formatMutation.mutate({ kind: "toggle", product })} aria-label={`${product.isActive ? "Disable" : "Enable"} ${displayName(product)}`} className={`rounded-full px-2 py-1 text-xs ${product.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}>
                      {product.isActive ? "Active" : "Disabled"}
                    </button>
                    <button type="button" onClick={() => setEditing(formatDraft(product))} aria-label={`Edit ${displayName(product)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"><Pencil size={15} /></button>
                    {!standardFormats.has(product.name.trim()) ? (
                      <button type="button" onClick={() => setDeleting(product)} aria-label={`Delete ${displayName(product)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-red-950/50 hover:text-red-300"><Trash2 size={15} /></button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 rounded-md border border-dashed border-neutral-800 p-3 text-sm text-neutral-500">No formats yet. Create one to make the channel bookable.</p>}

            {editing ? (
              <div className="mt-3 space-y-3 rounded-md border border-blue-900/60 bg-blue-950/10 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label="Format name" required><Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></FormField>
                  <FormField label="Hours first"><Input inputMode="numeric" value={editing.topHours} onChange={(event) => setEditing({ ...editing, topHours: event.target.value })} /></FormField>
                  <FormField label="Hours in feed"><Input inputMode="numeric" disabled={editing.permanent} value={editing.feedHours} onChange={(event) => setEditing({ ...editing, feedHours: event.target.value })} /></FormField>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleRow checked={editing.active} onChange={(active) => setEditing({ ...editing, active })} label="Active" />
                  <ToggleRow checked={editing.permanent} onChange={(permanent) => setEditing({ ...editing, permanent })} label="No auto-delete" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button disabled={formatMutation.isPending || Boolean(invalidFormat)} onClick={() => formatMutation.mutate({ kind: "save", draft: editing })}>Save format</Button>
                </div>
              </div>
            ) : null}
          </section>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => economicsMutation.mutate()} disabled={economicsMutation.isPending || Boolean(invalidNumber) || Boolean(invalidKpi)}>Save economics</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        entityName={deleting ? displayName(deleting) : ""}
        description="This custom format will stop appearing in new ad bookings."
        onConfirm={() => deleting ? formatMutation.mutateAsync({ kind: "delete", product: deleting }) : undefined}
      />
    </>
  );
}
