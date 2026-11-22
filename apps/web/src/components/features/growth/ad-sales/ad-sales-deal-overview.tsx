"use client";

import { useEffect, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { CalendarDays, ExternalLink } from "lucide-react";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { CrmClientField } from "@/components/features/growth/crm/crm-client-field";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { adSaleOriginOptions } from "./ad-sale-origin";
import { allowedSaleActions, type SaleActionKey } from "./sale-status-actions";
import { CustomSelect, FormField, IconButton, Skeleton } from "@/components/ui/primitives";
import type { Account, TelegramChannel } from "@/lib/api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { LifecycleCountdown } from "@/components/ui/lifecycle-countdown";
import { isValidZonedDateTimeInput, zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { formatDateTime } from "@/lib/date-format";
import { hasLinkedPlacementPost, placementFormatLabel, placementRunWindow, placementTimer } from "./ad-placement-lifecycle";
import { AdSalePostMetrics, PostMetrics } from "./ad-sale-post-metrics";
import { AdSaleDealPlacementActions } from "./ad-sale-deal-placement-actions";
import type { AdSaleApplyAllChanges } from "./ad-sale-deal-placement-actions";
import type { RegisterPaymentPayload } from "./register-payment-form";
import { DealFinanceTransaction } from "./deal-finance-transaction";
import { nativeAdSalePayment } from "./ad-sale-native-payment";
import { formatCompactMoney } from "@/lib/features/finance/money";
import { AdSalePlacementValue } from "./ad-sale-placement-value";
import { SaveFooter, type PaymentDraft, type PlacementDraft } from "./ad-sales-sale-detail-editors";

export function DealDetailsSkeleton() {
  return (
    <div aria-label="Loading deal" className="space-y-5">
      <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/45 p-4 xl:grid-cols-3 xl:items-end">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex gap-2">
          <Skeleton className="h-11 w-24 rounded-lg" />
          <Skeleton className="h-11 w-20 rounded-lg" />
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex justify-between gap-3">
              <div className="flex flex-1 items-start gap-2">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-5 w-48 max-w-full" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
            <div className="mt-4 flex justify-between border-t border-neutral-800 pt-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-36" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </section>
      <div className="flex justify-end border-t border-neutral-800 pt-4">
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}

export function DealOverview(props: {
  sale: TelegramAdSale;
  origin: TelegramAdSale["origin"];
  sellerMemberId: string;
  buyerContact: string;
  selectedAdvertiserId: string | null;
  selectedClient: { id: string; displayName: string; telegramUsername?: string | null; photoUrl?: string | null } | null;
  onSearchAdvertisers?: (query: string) => Promise<import("@telegram-system/shared").TelegramAdvertiser[]>;
  channels: Map<string, TelegramChannel>;
  payments: PaymentDraft[];
  accounts: Account[];
  paymentOpen: boolean;
  onOrigin: (v: TelegramAdSale["origin"]) => void;
  onSellerMember: (v: string) => void;
  onBuyerContact: (v: string) => void;
  onSelectAdvertiser: (advertiser: import("@telegram-system/shared").TelegramAdvertiser | null) => void;
  onPlacement: (v: string) => void;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  onApplyAll: (changes: AdSaleApplyAllChanges) => void;
  drafts: PlacementDraft[];
  onSharedPost?: () => void;
  onTogglePayment: () => void;
  onCreatePayment?: (payload: RegisterPaymentPayload) => Promise<void>;
  onPayment: (id: string, patch: Partial<PaymentDraft>) => void;
  onDeletePayment?: (id: string) => void;
  onAction: (a: SaleActionKey, placement?: TelegramAdSale["placements"][number]) => Promise<void>;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const dealValue = nativeAdSalePayment(props.sale);
  const [now, setNow] = useState(() => Date.now());
  const [deletingPublications, setDeletingPublications] = useState(false);
  useEffect(() => {
    const hasCountdown = props.sale.placements.some(
      (placement) =>
        (!placement.publishedAt &&
          new Date(placement.scheduledAt).getTime() > Date.now()) ||
        (placement.publishedAt &&
          placement.plannedDeleteAt &&
          !placement.deletedAt &&
          new Date(placement.plannedDeleteAt).getTime() > Date.now()),
    );
    if (!hasCountdown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.sale.placements]);
  return (
    <div className="min-w-0 space-y-5">
      <section className="min-w-0 space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/45 p-3 sm:p-4">
        <div className="grid min-w-0 gap-3 xl:grid-cols-3 xl:items-end">
          <CrmClientField
            contact={props.buyerContact}
            selectedAdvertiserId={props.selectedAdvertiserId}
            selectedClient={props.selectedClient}
            onContactChange={props.onBuyerContact}
            onTelegramChange={() => undefined}
            onSelect={props.onSelectAdvertiser}
            onSearchAdvertisers={props.onSearchAdvertisers ?? (async () => [])}
          />
          <FormField label="Sale origin">
            <CustomSelect
              value={props.origin}
              onChange={(v) => props.onOrigin(v as TelegramAdSale["origin"])}
              options={adSaleOriginOptions}
            />
          </FormField>
          <FormField label="Sold by">
            <MemberSelect
              value={props.sellerMemberId}
              onChange={props.onSellerMember}
            />
          </FormField>
        </div>
        <AdSaleDealPlacementActions
          key={props.sale.id}
          sale={props.sale}
          productsByChannelId={props.productsByChannelId}
          saving={props.saving}
          onApplyAll={props.onApplyAll}
          drafts={props.drafts}
          onSharedPost={props.onSharedPost} onOperatorAction={props.onAction}
        />
      </section>
      <section>
        <div className="mb-3 mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-semibold text-white">Placements</h4>
            <p className="text-sm text-neutral-500">
              Choose the placement you want to edit.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-neutral-600">
              Deal value
            </span>
            <span className="mt-0.5 block text-sm font-medium text-neutral-300">
              {formatCompactMoney(
                dealValue?.amount ?? 0,
                dealValue?.currency ?? props.sale.settlementCurrency,
              )}
            </span>
            <AdSalePostMetrics className="mt-1 justify-end" sale={props.sale} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {props.sale.placements.map((placement) => {
            const draft = props.drafts.find((item) => item.id === placement.id);
            const linked = hasLinkedPlacementPost(placement);
            const product = draft?.telegramAdProductId !== placement.telegramAdProductId
              ? props.productsByChannelId[placement.telegramChannelId]?.find((item) => item.id === draft?.telegramAdProductId)
              : undefined;
            const scheduledAt = draft && isValidZonedDateTimeInput(draft.date, draft.time)
              ? zonedDateTimeToUtc(draft.date, draft.time, draft.timezone).toISOString()
              : placement.scheduledAt;
            const p = { ...placement, scheduledAt };
            const format = product?.name ?? placementFormatLabel(p);
            const timer = linked ? placementTimer(p, now) : null;
            return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => props.onPlacement(p.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onPlacement(p.id);
                }
              }}
              className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-left transition hover:border-neutral-700"
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate font-medium text-white">
                    <TelegramEntityAvatar
                      imageUrl={
                        props.channels.get(p.telegramChannelId)?.photoUrl
                      }
                      kind="channel"
                      alt={
                        props.channels.get(p.telegramChannelId)?.title ??
                        "Telegram channel"
                      }
                      size="sm"
                    />
                    <span className="truncate">
                      {props.channels.get(p.telegramChannelId)?.title ??
                        "Telegram channel"}
                    </span>
                  </div>
                </div>
                <IconButton
                  type="button"
                  aria-label={`Edit placement ${props.channels.get(p.telegramChannelId)?.title ?? "Telegram channel"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onPlacement(p.id);
                  }}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1.5 text-neutral-500">
                  <CalendarDays size={13} className="shrink-0" aria-hidden="true" />
                  {placementRunWindow(p) ??
                    `Scheduled ${formatDateTime(p.scheduledAt, undefined, p.timezone)}`}
                </span>
                {format ? <span className="text-neutral-400">Format {format}</span> : null}
                {timer ? <LifecycleCountdown value={timer} /> : null}
              </div>
              {linked ? <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-2 border-t border-neutral-800 pt-2 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {timer?.phase !== "complete" && (p.publishedAt || p.telegramPostId) ? (
                      <span className="text-emerald-400">Post published</span>
                    ) : null}
                    {p.managedPostId ||
                    p.telegramPostUrl ||
                    p.managedPost?.telegramMessageUrls[0] ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {p.managedPostId ? (
                          <a
                            href={buildTelegramPostsUrl({
                              channelId: p.telegramChannelId,
                              postId: p.managedPostId,
                              postView: "editor",
                            })}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            Open in system <ExternalLink size={12} />
                          </a>
                        ) : null}
                        {timer?.phase !== "complete" &&
                        (p.telegramPostUrl ??
                          p.managedPost?.telegramMessageUrls[0]) ? (
                          <a
                            href={
                              p.telegramPostUrl ??
                              p.managedPost?.telegramMessageUrls[0]
                            }
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            Open in Telegram <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {p.telegramPost ? (
                    <PostMetrics
                      className="mt-1"
                      views={p.telegramPost.viewsCount}
                      reactions={p.telegramPost.reactionsCount}
                      forwards={p.telegramPost.forwardsCount}
                      comments={p.telegramPost.commentsCount}
                    />
                  ) : null}
                </div>
                <AdSalePlacementValue sale={props.sale} placement={p} />
              </div> : null}
            </div>
          ); })}
        </div>
      </section>
      <DealFinanceTransaction
        sale={props.sale}
        payments={props.payments}
        accounts={props.accounts}
        open={props.paymentOpen}
        onToggle={props.onTogglePayment}
        onPayment={props.onPayment}
        onCreatePayment={props.onCreatePayment}
        onDeletePayment={props.onDeletePayment}
        placementSchedule={props.drafts[0]}
      />
      <SaveFooter
        error={props.error}
        saving={props.saving}
        onSave={props.onSave}
        deletingPublications={deletingPublications}
        onDeletePublications={
          allowedSaleActions(props.sale).includes("delete-publications")
            ? async () => {
                setDeletingPublications(true);
                try {
                  await props.onAction("delete-publications");
                } finally {
                  setDeletingPublications(false);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
