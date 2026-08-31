"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdSaleListItem } from "@telegram-system/shared";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { AdSaleOriginPreview } from "./ad-sale-origin";
import { NativeMoney } from "@/components/ui/native-money";
import { Pagination } from "@/components/ui/pagination";
import {
  EmptyState,
  ErrorState,
  ConfirmDeleteModal,
  Input,
  TableLoadingState,
} from "@/components/ui/primitives";
import { currenciesApi, type TelegramChannel } from "@/lib/api";
import { nativeAdSalePayment } from "./ad-sale-native-payment";
import { AdSalePostMetrics } from "./ad-sale-post-metrics";
import { AdSalePlacementLifecyclePreview } from "./ad-sale-placement-lifecycle-preview";

const panelClass = "rounded-[18px] border border-neutral-800 bg-[#111111]";

function clientLabel(sale: TelegramAdSaleListItem) {
  return (
    sale.advertiserTelegramSnapshot ||
    sale.advertiserTelegram ||
    sale.advertiserNameSnapshot ||
    sale.advertiserName ||
    sale.advertiserContact ||
    "Client"
  );
}

function paymentLabel(sale: TelegramAdSaleListItem) {
  const received = Number(sale.totalPaidAmount || 0);
  const outstanding = Number(sale.outstandingAmount || 0);
  if (received <= 0) return "Not paid";
  if (outstanding > 0) return "Partially received";
  return "Money received";
}

type SalePlacement = TelegramAdSaleListItem["placements"][number];

function hasLinkedPlacementPost(placement: SalePlacement) {
  return Boolean(
    placement.telegramPostId ||
    placement.publishedAt ||
    placement.managedPost?.telegramMessageIds?.length,
  );
}

export function SalesTab(props: {
  sales: TelegramAdSaleListItem[];
  channels: TelegramChannel[];
  loading: boolean;
  error: unknown;
  page: number;
  pageSize: number;
  pagination?: {
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
  };
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listLatestRates>> | undefined;
  onOpenSale: (saleId: string) => void;
  onDeleteSale: (sale: TelegramAdSaleListItem) => Promise<void>;
  embedded?: boolean;
}) {
  const [menuSaleId, setMenuSaleId] = useState<string | null>(null);
  const [deleteSale, setDeleteSale] = useState<TelegramAdSaleListItem | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuSaleId) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuSaleId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuSaleId(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuSaleId]);
  useEffect(() => {
    const hasCountdown = props.sales.some((sale) =>
      sale.placements.some(
        (placement) =>
          !placement.publishedAt ||
          (placement.publishedAt &&
            Date.now() - new Date(placement.publishedAt).getTime() < 3_000) ||
          (placement.publishedAt &&
            placement.plannedDeleteAt &&
            !placement.deletedAt &&
            new Date(placement.plannedDeleteAt).getTime() > Date.now()),
      ),
    );
    if (!hasCountdown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.sales]);
  const channelsById = new Map(
    props.channels.map((channel) => [channel.id, channel]),
  );
  return (
    <div className="space-y-4">
      {!props.embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">All deals</h2>
            <p className="text-sm text-neutral-500">
              Complete sales history, independent of the slot calendar period.
            </p>
          </div>
          <Input
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Search client"
            aria-label="Search deals"
            className="w-full sm:w-72"
          />
        </div>
      ) : null}

      {props.loading ? (
        <TableLoadingState
          columns={props.embedded ? 4 : 5}
          rows={props.sales.length || props.pageSize}
        />
      ) : null}
      {props.error ? <ErrorState text="Could not load ad sales." /> : null}
      {!props.loading && !props.error ? (
        <div className={`${panelClass} overflow-hidden`}>
          <div className="table-scroll w-full">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950/60 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Sale details</th>
                  <th className="px-4 py-3">Placement</th>
                  <th className="w-48 px-4 py-3 text-right">Received</th>
                  {!props.embedded ? (
                    <th className="w-12 px-2 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {props.sales.map((sale) => {
                  const receivedPayment = nativeAdSalePayment(sale);
                  const linkedPosts = sale.placements.filter(
                    hasLinkedPlacementPost,
                  ).length;
                  const hasMultiplePlacementOutputs =
                    new Set(
                      sale.placements.map((item) => item.telegramChannelId),
                    ).size > 1;
                  return (
                    <tr
                      key={sale.id}
                      className={`cursor-pointer transition hover:bg-neutral-900/70 ${hasMultiplePlacementOutputs ? "[&>td]:align-top" : ""}`}
                      onClick={() => props.onOpenSale(sale.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <TelegramEntityAvatar
                            imageUrl={
                              sale.advertiserTelegramSnapshot ||
                              sale.advertiserTelegram
                                ? `https://t.me/i/userpic/320/${(sale.advertiserTelegramSnapshot || sale.advertiserTelegram)!.replace(/^@+/, "")}.jpg`
                                : null
                            }
                            kind="person"
                            alt={clientLabel(sale)}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">
                              {clientLabel(sale)}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              {linkedPosts}/{sale.placements.length} posts
                              linked
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <AdSaleOriginPreview origin={sale.origin} />
                          {sale.assignedMember ? (
                            <div className="flex items-center gap-2">
                              <IconAvatar
                                icon={sale.assignedMember.avatarPresentation}
                                label={sale.assignedMember.name}
                                size="xs"
                              />
                              <span className="max-w-40 truncate text-xs text-neutral-300">
                                {sale.assignedMember.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-500">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {sale.placements.length ? (
                          <AdSalePlacementLifecyclePreview
                            placements={sale.placements}
                            channelsById={channelsById}
                            now={now}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <NativeMoney
                          amount={receivedPayment.amount}
                          currency={receivedPayment.currency}
                          displayMode="code"
                          className="whitespace-nowrap font-semibold text-white"
                        />
                        <p
                          className={`mt-1 text-xs ${
                            Number(sale.totalPaidAmount || 0) > 0
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {paymentLabel(sale)}
                        </p>
                        <AdSalePostMetrics
                          sale={sale}
                          className="mt-2 justify-end"
                        />
                      </td>
                      {!props.embedded ? (
                        <td
                          className="relative px-2 py-3 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Actions for ${clientLabel(sale)}`}
                            className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                            onClick={() =>
                              setMenuSaleId((current) =>
                                current === sale.id ? null : sale.id,
                              )
                            }
                          >
                            <MoreVertical size={20} />
                          </button>
                          {menuSaleId === sale.id ? (
                            <div
                              ref={menuRef}
                              role="menu"
                              className="absolute bottom-2 right-11 z-30 w-44 rounded-lg border border-neutral-700 bg-neutral-950 p-1 text-left shadow-xl"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                                onClick={() => {
                                  setMenuSaleId(null);
                                  props.onOpenSale(sale.id);
                                }}
                              >
                                <Pencil size={16} /> Edit deal
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-300 hover:bg-rose-950/50"
                                onClick={() => {
                                  setMenuSaleId(null);
                                  setDeleteSale(sale);
                                }}
                              >
                                <Trash2 size={16} /> Delete deal
                              </button>
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!props.sales.length ? (
            <div className="p-5">
              <EmptyState text="No deals found." />
            </div>
          ) : null}
        </div>
      ) : null}

      {props.pagination ? (
        <Pagination
          page={props.pagination.page}
          pageSize={props.pagination.pageSize}
          totalItems={props.pagination.totalItems}
          totalPages={props.pagination.totalPages}
          hasNextPage={props.pagination.hasNextPage}
          hasPreviousPage={props.pagination.hasPreviousPage}
          onPageChange={props.onPageChange}
          onPageSizeChange={props.onPageSizeChange}
          loading={props.loading}
        />
      ) : null}
      <ConfirmDeleteModal
        open={Boolean(deleteSale)}
        onClose={() => setDeleteSale(null)}
        entityName={deleteSale ? clientLabel(deleteSale) : "deal"}
        description="The deal, its placements, finance transactions, and linked posts will be deleted from the system. Published posts will also be deleted from Telegram."
        onConfirm={async () => {
          if (!deleteSale) return;
          await props.onDeleteSale(deleteSale);
          setDeleteSale(null);
        }}
      />
    </div>
  );
}
