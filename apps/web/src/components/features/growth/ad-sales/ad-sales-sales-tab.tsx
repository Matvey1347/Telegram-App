"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdSale } from "@telegram-system/shared";
import { Hourglass, MoreVertical, Pencil, Timer, Trash2 } from "lucide-react";
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
import { formatDateTime } from "@/lib/date-format";
import { nativeAdSalePayment } from "./ad-sale-native-payment";
import {
  placementFormatLabel,
  placementRunWindow,
  placementTimer,
} from "./ad-placement-lifecycle";
import { AdSalePostMetrics } from "./ad-sale-post-metrics";

const panelClass = "rounded-[18px] border border-neutral-800 bg-[#111111]";

function clientLabel(sale: TelegramAdSale) {
  return (
    sale.advertiserTelegramSnapshot ||
    sale.advertiserTelegram ||
    sale.advertiserNameSnapshot ||
    sale.advertiserName ||
    sale.advertiserContact ||
    "Client"
  );
}

function paymentLabel(sale: TelegramAdSale) {
  const received = Number(sale.totalPaidAmount || 0);
  const outstanding = Number(sale.outstandingAmount || 0);
  if (received <= 0) return "Not paid";
  if (outstanding > 0) return "Partially received";
  return "Money received";
}

type SalePlacement = TelegramAdSale["placements"][number];

function hasLinkedPlacementPost(placement: SalePlacement) {
  return Boolean(
    placement.telegramPostId ||
    placement.publishedAt ||
    placement.managedPost?.telegramMessageIds?.length,
  );
}

function groupPlacementsByWindow(placements: SalePlacement[]) {
  return [
    ...placements
      .reduce((groups, placement) => {
        const scheduledAt = new Date(placement.scheduledAt).getTime();
        const publishedAt = placement.publishedAt
          ? new Date(placement.publishedAt).getTime()
          : null;
        const startsAt =
          publishedAt !== null && publishedAt > scheduledAt
            ? publishedAt
            : scheduledAt;
        const key = `${startsAt}|${placement.plannedDeleteAt ?? ""}|${placement.publishedAt ? "published" : "scheduled"}`;
        const group = groups.get(key);
        if (group) group.push(placement);
        else groups.set(key, [placement]);
        return groups;
      }, new Map<string, SalePlacement[]>())
      .values(),
  ];
}

function placementsShareChannel(placements: SalePlacement[]) {
  return (
    placements.length > 1 &&
    placements.every(
      (placement) =>
        placement.telegramChannelId === placements[0].telegramChannelId,
    )
  );
}

function placementScheduleRange(placements: SalePlacement[]) {
  const scheduledTimes = placements
    .map((placement) => new Date(placement.scheduledAt).getTime())
    .sort((left, right) => left - right);
  return `Scheduled ${formatDateTime(new Date(scheduledTimes[0]).toISOString())} → ${formatDateTime(new Date(scheduledTimes.at(-1)!).toISOString())}`;
}

function placementFormatsLabel(placements: SalePlacement[]) {
  const formats = [
    ...new Set(placements.map(placementFormatLabel).filter(Boolean)),
  ];
  return formats.join(", ");
}

function PlacementChannelPreview(props: {
  placements: SalePlacement[];
  channelsById: Map<string, TelegramChannel>;
}) {
  const channels = props.placements.map((placement) => {
    const channel = props.channelsById.get(placement.telegramChannelId);
    return {
      id: placement.telegramChannelId,
      title: channel?.title ?? "Telegram channel",
      photoUrl: channel?.photoUrl ?? null,
    };
  });
  if (channels.length === 1) {
    const channel = channels[0];
    return (
      <div className="flex min-w-0 items-center gap-2">
        <TelegramEntityAvatar
          imageUrl={channel.photoUrl}
          kind="channel"
          alt={channel.title}
          size="xs"
        />
        <span className="truncate text-xs font-medium text-neutral-300">
          {channel.title}
        </span>
      </div>
    );
  }
  return (
    <details
      className="group relative w-fit"
      onClick={(event) => event.stopPropagation()}
    >
      <summary
        aria-label={`Show ${channels.length} placement channels`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex -space-x-2">
          {channels.slice(0, 3).map((channel) => (
            <span
              key={channel.id}
              className="rounded-full ring-2 ring-[#111111]"
            >
              <TelegramEntityAvatar
                imageUrl={channel.photoUrl}
                kind="channel"
                alt={channel.title}
                size="xs"
              />
            </span>
          ))}
        </span>
        <span className="text-xs font-medium text-neutral-300">
          {channels.length} channels
        </span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-2 min-w-56 space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
        {channels.map((channel) => (
          <div key={channel.id} className="flex items-center gap-2 px-1 py-1">
            <TelegramEntityAvatar
              imageUrl={channel.photoUrl}
              kind="channel"
              alt={channel.title}
              size="xs"
            />
            <span className="whitespace-nowrap text-xs text-neutral-200">
              {channel.title}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function SalesTab(props: {
  sales: TelegramAdSale[];
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
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onOpenSale: (saleId: string) => void;
  onDeleteSale: (sale: TelegramAdSale) => Promise<void>;
  embedded?: boolean;
}) {
  const [menuSaleId, setMenuSaleId] = useState<string | null>(null);
  const [deleteSale, setDeleteSale] = useState<TelegramAdSale | null>(null);
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
          (!placement.publishedAt &&
            new Date(placement.scheduledAt).getTime() > Date.now()) ||
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

      {props.loading ? <TableLoadingState columns={4} rows={6} /> : null}
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
                    !placementsShareChannel(sale.placements) &&
                    groupPlacementsByWindow(sale.placements).length > 1;
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
                          <div className="space-y-2">
                            {placementsShareChannel(sale.placements) ? (
                              <div className="min-w-0">
                                <PlacementChannelPreview
                                  placements={[sale.placements[0]]}
                                  channelsById={channelsById}
                                />
                                <p className="mt-0.5 max-w-72 text-xs text-neutral-500">
                                  {placementScheduleRange(sale.placements)}
                                  {placementFormatsLabel(sale.placements)
                                    ? ` · ${placementFormatsLabel(sale.placements)}`
                                    : ""}
                                </p>
                                <p className="mt-0.5 text-xs text-neutral-500">
                                  {sale.placements.length} placements
                                </p>
                              </div>
                            ) : (
                              groupPlacementsByWindow(sale.placements).map(
                                (placements) => {
                                  const placement = placements[0];
                                  const timer = placementTimer(placement, now);
                                  return (
                                    <div
                                      key={placements
                                        .map(({ id }) => id)
                                        .join("-")}
                                      className="min-w-0"
                                    >
                                      <PlacementChannelPreview
                                        placements={placements}
                                        channelsById={channelsById}
                                      />
                                      <p className="mt-0.5 max-w-72 text-xs text-neutral-500">
                                        {placementRunWindow(placement) ??
                                          `Scheduled ${formatDateTime(placement.scheduledAt)}`}
                                        {placementFormatsLabel(placements)
                                          ? ` · ${placementFormatsLabel(placements)}`
                                          : ""}
                                      </p>
                                      {timer ? (
                                        <p
                                          className={`mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs tabular-nums ${timer.phase === "deletion" ? "text-amber-300" : "text-neutral-500"}`}
                                        >
                                          {timer.phase === "complete" ? (
                                            <Trash2
                                              size={13}
                                              aria-hidden="true"
                                            />
                                          ) : timer.phase === "deletion" ? (
                                            <Timer
                                              size={13}
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Hourglass
                                              size={13}
                                              aria-hidden="true"
                                            />
                                          )}
                                          {timer.label}
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                },
                              )
                            )}
                          </div>
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
        />
      ) : null}
      <ConfirmDeleteModal
        open={Boolean(deleteSale)}
        onClose={() => setDeleteSale(null)}
        entityName={deleteSale ? clientLabel(deleteSale) : "deal"}
        description="The deal and its placements will be deleted. Existing finance transactions will remain in the ledger."
        onConfirm={async () => {
          if (!deleteSale) return;
          await props.onDeleteSale(deleteSale);
          setDeleteSale(null);
        }}
      />
    </div>
  );
}
