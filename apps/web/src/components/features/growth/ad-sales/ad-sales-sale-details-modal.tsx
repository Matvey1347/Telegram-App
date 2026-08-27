"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  ExternalLink,
  Hourglass,
  Pencil,
  Link2,
  Timer,
  Trash2,
} from "lucide-react";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { adSaleOriginOptions } from "./ad-sale-origin";
import { SaleStatusActions, type SaleActionKey } from "./sale-status-actions";
import {
  Button,
  CustomSelect,
  DateInput,
  FormField,
  Input,
  IconButton,
  Modal,
  Select,
  Skeleton,
  TimeInput,
} from "@/components/ui/primitives";
import type { Account, TelegramChannel } from "@/lib/api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { currenciesApi } from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
  toNumber,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { formatDateTime } from "@/lib/date-format";
import { placementRunWindow, placementTimer } from "./ad-placement-lifecycle";
import { AdSalePostMetrics, PostMetrics } from "./ad-sale-post-metrics";
import { AdSaleSharedPostEditor } from "./ad-sale-shared-post-editor";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";

type PlacementDraft = {
  id: string;
  date: string;
  time: string;
  timezone: string;
  agreedPrice: string;
  recommendedPrice: string;
  minimumPrice: string;
  manualPriceReason: string;
  telegramAdProductId: string;
  managedPostId: string;
  telegramPostId: string;
};

type PlacementPostOption = {
  id: string;
  title: string;
  publishedAt: string;
};
type PaymentDraft = {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  paidDate: string;
  paidTime: string;
  notes: string;
};

function PlacementDeletionCountdown({
  placement,
  now: sharedNow,
}: {
  placement: TelegramAdSale["placements"][number];
  now?: number;
}) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    if (sharedNow !== undefined || placement.deletedAt) return;
    const hasActiveTimer = placement.publishedAt
      ? Boolean(placement.plannedDeleteAt)
      : new Date(placement.scheduledAt).getTime() > Date.now();
    if (!hasActiveTimer) return;
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [
    placement.deletedAt,
    placement.plannedDeleteAt,
    placement.publishedAt,
    placement.scheduledAt,
    sharedNow,
  ]);
  const now = sharedNow ?? localNow;
  const timer = placementTimer(placement, now);
  if (!timer) return null;
  return (
    <div className="mt-2 text-xs">
      <p
        className={`inline-flex items-center gap-1.5 font-mono font-medium tabular-nums ${timer.phase === "complete" ? "text-neutral-500" : timer.phase === "deletion" ? "text-amber-300" : "text-sky-400"}`}
      >
        {timer.phase === "complete" ? (
          <Trash2 size={13} aria-hidden="true" />
        ) : timer.phase === "deletion" ? (
          <Timer size={13} aria-hidden="true" />
        ) : (
          <Hourglass size={13} aria-hidden="true" />
        )}
        {timer.label}
      </p>
    </div>
  );
}

type SaveDraft = {
  placements: Array<{
    id: string;
    scheduledAt: string;
    timezone: string;
    agreedPrice: number;
    recommendedPrice: number;
    minimumPrice: number;
    currency: string;
    manualPriceReason: string | null;
    telegramAdProductId: string | null;
    managedPostId: string | null;
  }>;
  payments: Array<{
    id: string;
    accountId: string;
    amount: number;
    currency: string;
    paidAt: string;
    notes: string | null;
    allocations: Array<{ placementId: string; amount: number }>;
  }>;
  origin: TelegramAdSale["origin"];
  assignedMemberId: string | null;
  buyerContact: string;
};

export function SaleDetailsModal(props: {
  sale: TelegramAdSale | null;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  accounts: Account[];
  channels: TelegramChannel[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onSave: (sale: TelegramAdSale, draft: SaveDraft) => Promise<void>;
  onAction: (
    sale: TelegramAdSale,
    action: SaleActionKey,
    placement?: TelegramAdSale["placements"][number],
  ) => Promise<void>;
  onAttachPost?: (
    sale: TelegramAdSale,
    placement: TelegramAdSale["placements"][number],
    post: { telegramPostUrl?: string; telegramPostId?: string },
  ) => Promise<void>;
  onLoadPlacementPosts?: (
    placement: TelegramAdSale["placements"][number],
  ) => Promise<PlacementPostOption[]>;
  onUpdateSharedPost?: (
    sale: TelegramAdSale,
    draft: PlacementManagedPostDraft,
  ) => Promise<void>;
}) {
  const [placements, setPlacements] = useState<PlacementDraft[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [syncPayment, setSyncPayment] = useState(true);
  const [origin, setOrigin] = useState<TelegramAdSale["origin"]>("DIRECT");
  const [memberId, setMemberId] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initializedSaleId, setInitializedSaleId] = useState<string | null>(
    null,
  );
  const [sharedPostOpen, setSharedPostOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- server entity initializes one cohesive draft */
  useEffect(() => {
    if (!props.sale || !props.open) return;
    setOrigin(props.sale.origin);
    setMemberId(props.sale.assignedMemberId ?? "");
    setBuyerContact(
      props.sale.advertiserTelegramSnapshot ??
        props.sale.advertiserTelegram ??
        props.sale.advertiserContact ??
        props.sale.advertiserNameSnapshot ??
        props.sale.advertiserName ??
        "",
    );
    setSelectedId(null);
    setSharedPostOpen(false);
    setPaymentOpen(false);
    setSyncPayment(true);
    setError("");
    setPlacements(
      props.sale.placements.map((p) => ({
        id: p.id,
        date: channelLocalDateKey(p.scheduledAt, p.timezone),
        time: channelLocalTime(p.scheduledAt, p.timezone),
        timezone: p.timezone,
        agreedPrice: p.agreedPrice,
        recommendedPrice: p.recommendedPrice,
        minimumPrice: p.minimumPrice,
        manualPriceReason: p.manualPriceReason ?? "",
        telegramAdProductId: p.telegramAdProductId ?? "",
        managedPostId: p.managedPostId ?? "",
        telegramPostId: p.telegramPostId ?? "",
      })),
    );
    setPayments(
      (props.sale.payments ?? [])
        .filter((p) => p.status !== "VOIDED")
        .map((p) => ({
          id: p.id,
          accountId: p.accountId,
          amount: p.amount,
          currency:
            props.accounts.find((a) => a.id === p.accountId)?.currency ??
            p.currency,
          paidDate: p.paidAt.slice(0, 10),
          paidTime: p.paidAt.slice(11, 16),
          notes: p.notes ?? "",
        })),
    );
    setInitializedSaleId(props.sale.id);
  }, [props.accounts, props.open, props.sale]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!props.sale || initializedSaleId !== props.sale.id) {
    return (
      <Modal open={props.open} onClose={props.onClose} title="Deal" size="xl">
        <DealDetailsSkeleton />
      </Modal>
    );
  }
  const sale = props.sale;
  const placement = sale.placements.find((p) => p.id === selectedId);
  const draft = placements.find((p) => p.id === selectedId);
  const currency = payments[0]?.currency ?? sale.settlementCurrency;
  const total = placements.reduce((sum, p) => sum + toNumber(p.agreedPrice), 0);
  const originalTotal = sale.placements.reduce(
    (sum, p) => sum + toNumber(p.agreedPrice),
    0,
  );
  const priceChanged = Math.abs(total - originalTotal) > 0.001;
  const channels = new Map(props.channels.map((c) => [c.id, c]));
  const changePlacement = (patch: Partial<PlacementDraft>) =>
    setPlacements((items) =>
      items.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)),
    );
  const changePayment = (id: string, patch: Partial<PaymentDraft>) =>
    setPayments((items) =>
      items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const save = async () => {
    setSaving(true);
    setError("");
    props.onClose();
    try {
      await props.onSave(sale, {
        origin,
        assignedMemberId: memberId || null,
        buyerContact: buyerContact.trim(),
        placements: placements.map((p) => ({
          id: p.id,
          scheduledAt: zonedDateTimeToUtc(
            p.date,
            p.time,
            p.timezone,
          ).toISOString(),
          timezone: p.timezone,
          agreedPrice: toNumber(p.agreedPrice),
          recommendedPrice: toNumber(p.recommendedPrice),
          minimumPrice: toNumber(p.minimumPrice),
          currency,
          manualPriceReason: p.manualPriceReason.trim() || null,
          telegramAdProductId: p.telegramAdProductId || null,
          managedPostId: p.managedPostId || null,
        })),
        payments: payments.map((p, index) => {
          const amount =
            priceChanged && syncPayment && index === 0
              ? total
              : toNumber(p.amount);
          return {
            id: p.id,
            accountId: p.accountId,
            amount,
            currency:
              props.accounts.find((a) => a.id === p.accountId)?.currency ??
              p.currency,
            paidAt: new Date(
              `${p.paidDate}T${p.paidTime || "00:00"}:00`,
            ).toISOString(),
            notes: p.notes.trim() || null,
            allocations: allocatePayment(amount, placements),
          };
        }),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={
        sharedPostOpen
          ? "Edit shared post"
          : placement
            ? "Edit placement"
            : `Deal · ${clientName(sale)}`
      }
      size="xl"
      leadingHeaderAction={
        placement || sharedPostOpen ? (
          <button
            type="button"
            aria-label="Back to deal"
            title="Back to deal"
            onClick={() => {
              setSelectedId(null);
              setSharedPostOpen(false);
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>
        ) : null
      }
    >
      {sharedPostOpen ? (
        <AdSaleSharedPostEditor
          sale={sale}
          channelTitle="Advertising post"
          onSave={(nextDraft) =>
            props.onUpdateSharedPost
              ? (props.onClose(), props.onUpdateSharedPost(sale, nextDraft))
              : Promise.reject(new Error("Shared post editing is unavailable."))
          }
        />
      ) : placement && draft ? (
        <PlacementEditor
          sale={sale}
          placement={placement}
          draft={draft}
          currency={currency}
          channelName={
            channels.get(placement.telegramChannelId)?.title ??
            "Telegram channel"
          }
          channelPhotoUrl={
            channels.get(placement.telegramChannelId)?.photoUrl ?? null
          }
          products={
            props.productsByChannelId[placement.telegramChannelId] ?? []
          }
          priceChanged={priceChanged}
          total={total}
          hasPayment={payments.length > 0}
          syncPayment={syncPayment}
          onSync={setSyncPayment}
          onChange={changePlacement}
          onAction={(action) => props.onAction(sale, action, placement)}
          onAttachPost={(post) =>
            props.onAttachPost
              ? props.onAttachPost(sale, placement, post)
              : Promise.reject(new Error("Post attachment is unavailable."))
          }
          onLoadPosts={() =>
            props.onLoadPlacementPosts?.(placement) ?? Promise.resolve([])
          }
          onSave={save}
          saving={saving}
          error={error}
        />
      ) : (
        <DealOverview
          sale={sale}
          origin={origin}
          memberId={memberId}
          buyerContact={buyerContact}
          channels={channels}
          payments={payments}
          accounts={props.accounts}
          paymentOpen={paymentOpen}
          onOrigin={setOrigin}
          onMember={setMemberId}
          onBuyerContact={setBuyerContact}
          onPlacement={setSelectedId}
          onSharedPost={
            props.onUpdateSharedPost ? () => setSharedPostOpen(true) : undefined
          }
          onTogglePayment={() => setPaymentOpen((v) => !v)}
          onRegister={() => props.onAction(sale, "register-payment")}
          onPayment={changePayment}
          onAction={(action) => props.onAction(sale, action)}
          onSave={save}
          saving={saving}
          error={error}
        />
      )}
    </Modal>
  );
}

function DealDetailsSkeleton() {
  return (
    <div aria-label="Loading deal" className="space-y-5">
      <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/45 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
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

function DealOverview(props: {
  sale: TelegramAdSale;
  origin: TelegramAdSale["origin"];
  memberId: string;
  buyerContact: string;
  channels: Map<string, TelegramChannel>;
  payments: PaymentDraft[];
  accounts: Account[];
  paymentOpen: boolean;
  onOrigin: (v: TelegramAdSale["origin"]) => void;
  onMember: (v: string) => void;
  onBuyerContact: (v: string) => void;
  onPlacement: (v: string) => void;
  onSharedPost?: () => void;
  onTogglePayment: () => void;
  onRegister: () => void;
  onPayment: (id: string, patch: Partial<PaymentDraft>) => void;
  onAction: (a: SaleActionKey) => Promise<void>;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const [now, setNow] = useState(() => Date.now());
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
    <div className="space-y-5">
      <section className="grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950/45 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <FormField label="Buyer">
          <Input
            value={props.buyerContact}
            onChange={(event) => props.onBuyerContact(event.target.value)}
            placeholder="@username, phone, email"
          />
        </FormField>
        <FormField label="Sale origin">
          <CustomSelect
            value={props.origin}
            onChange={(v) => props.onOrigin(v as TelegramAdSale["origin"])}
            options={adSaleOriginOptions}
          />
        </FormField>
        <FormField label="Sold by">
          <MemberSelect value={props.memberId} onChange={props.onMember} />
        </FormField>
        <SaleStatusActions
          sale={props.sale}
          onAction={props.onAction}
          hidePayment
        />
      </section>
      <section>
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div>
            <h4 className="font-semibold text-white">Placements</h4>
            <p className="text-sm text-neutral-500">
              Choose the placement you want to edit.
            </p>
          </div>
          {props.onSharedPost &&
          props.sale.placements.length > 1 &&
          props.sale.placements.every(
            (placement) => placement.managedPostId && placement.managedPost,
          ) ? (
            <Button onClick={props.onSharedPost}>
              <span className="inline-flex items-center gap-2">
                <Pencil size={16} aria-hidden="true" />
                Edit shared post
              </span>
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="text-right">
            <span className="text-sm text-neutral-400">
              {props.sale.totalAgreedAmount} {props.sale.settlementCurrency}
            </span>
            <AdSalePostMetrics className="mt-1 justify-end" sale={props.sale} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {props.sale.placements.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-left"
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
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                    <CalendarDays size={13} />
                    {placementRunWindow(p) ??
                      `Scheduled ${formatDateTime(p.scheduledAt)}`}
                  </p>
                  <PlacementDeletionCountdown placement={p} now={now} />
                </div>
                <IconButton
                  type="button"
                  aria-label={`Edit placement ${props.channels.get(p.telegramChannelId)?.title ?? "Telegram channel"}`}
                  onClick={() => props.onPlacement(p.id)}
                />
              </div>
              <div className="mt-4 flex justify-between border-t border-neutral-800 pt-3 text-sm">
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={
                        p.telegramPostId || p.managedPostId
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {p.telegramPostId
                        ? "Post published"
                        : p.managedPostId
                          ? "Post configured"
                          : "No post selected"}
                    </span>
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
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            Open in system <ExternalLink size={12} />
                          </a>
                        ) : null}
                        {!p.deletedAt &&
                        (p.telegramPostUrl ??
                          p.managedPost?.telegramMessageUrls[0]) ? (
                          <a
                            href={
                              p.telegramPostUrl ??
                              p.managedPost?.telegramMessageUrls[0]
                            }
                            target="_blank"
                            rel="noreferrer"
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
                      className="mt-2"
                      views={p.telegramPost.viewsCount}
                      reactions={p.telegramPost.reactionsCount}
                      forwards={p.telegramPost.forwardsCount}
                      comments={p.telegramPost.commentsCount}
                    />
                  ) : null}
                </div>
                <span className="font-semibold text-white">
                  {p.agreedPrice} {p.currency}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-neutral-400" />
            <div>
              <h4 className="font-medium text-white">Finance transaction</h4>
              <p className="text-sm text-neutral-500">
                {props.payments.length
                  ? `${props.sale.totalPaidAmount} ${props.sale.settlementCurrency} linked`
                  : "No finance transaction linked"}
              </p>
            </div>
          </div>
          <IconButton
            type="button"
            aria-label={
              props.payments.length ? "Edit transaction" : "Link transaction"
            }
            onClick={
              props.payments.length ? props.onTogglePayment : props.onRegister
            }
          />
        </div>
        {props.paymentOpen && props.payments.length ? (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
            {props.payments.map((p) => (
              <PaymentEditor
                key={p.id}
                payment={p}
                accounts={props.accounts}
                onChange={(patch) => props.onPayment(p.id, patch)}
              />
            ))}
          </div>
        ) : null}
      </section>
      <SaveFooter
        error={props.error}
        saving={props.saving}
        onSave={props.onSave}
      />
    </div>
  );
}

function PlacementEditor(props: {
  sale: TelegramAdSale;
  placement: TelegramAdSale["placements"][number];
  draft: PlacementDraft;
  currency: string;
  channelName: string;
  channelPhotoUrl: string | null;
  products: TelegramAdProduct[];
  priceChanged: boolean;
  total: number;
  hasPayment: boolean;
  syncPayment: boolean;
  onSync: (v: boolean) => void;
  onChange: (p: Partial<PlacementDraft>) => void;
  onAction: (a: SaleActionKey) => Promise<void>;
  onAttachPost: (post: {
    telegramPostUrl?: string;
    telegramPostId?: string;
  }) => Promise<void>;
  onLoadPosts: () => Promise<PlacementPostOption[]>;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string;
}) {
  const [postEditorOpen, setPostEditorOpen] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");
  const [postOptions, setPostOptions] = useState<PlacementPostOption[]>([]);
  const [postOptionsLoading, setPostOptionsLoading] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [postInputMode, setPostInputMode] = useState<"select" | "link">(
    "select",
  );
  const hasLinkedPost = Boolean(
    props.placement.managedPostId || props.draft.telegramPostId,
  );
  const systemPostUrl = props.placement.managedPostId
    ? buildTelegramPostsUrl({
        channelId: props.placement.telegramChannelId,
        postId: props.placement.managedPostId,
        postView: "editor",
      })
    : null;
  const telegramPostUrl =
    props.placement.telegramPostUrl ??
    props.placement.managedPost?.telegramMessageUrls[0] ??
    null;

  const openPostEditor = async () => {
    setPostEditorOpen((open) => !open);
    if (postEditorOpen || postOptions.length) return;
    setPostOptionsLoading(true);
    setPostError("");
    try {
      setPostOptions(await props.onLoadPosts());
    } catch (cause) {
      setPostError(
        cause instanceof Error ? cause.message : "Could not load posts.",
      );
    } finally {
      setPostOptionsLoading(false);
    }
  };

  const saveChanges = async () => {
    if (!postEditorOpen) {
      await props.onSave();
      return;
    }
    const payload =
      postInputMode === "link"
        ? postUrl.trim()
          ? { telegramPostUrl: postUrl.trim() }
          : null
        : selectedPostId
          ? { telegramPostId: selectedPostId }
          : null;
    if (!payload) {
      setPostError("Select a post or paste its Telegram link.");
      return;
    }
    setPostSaving(true);
    setPostError("");
    try {
      await props.onAttachPost(payload);
      await props.onSave();
      setPostUrl("");
      setSelectedPostId("");
      setPostEditorOpen(false);
    } catch (cause) {
      setPostError(
        cause instanceof Error ? cause.message : "Could not save post.",
      );
    } finally {
      setPostSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <TelegramEntityAvatar
              imageUrl={props.channelPhotoUrl}
              kind="channel"
              alt={props.channelName}
              size="sm"
            />
            <h4 className="truncate font-semibold text-white">
              {props.channelName}
            </h4>
          </div>
          <SaleStatusActions
            sale={props.sale}
            placement={props.placement}
            onAction={props.onAction}
            hideSchedule
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Date">
            <DateInput
              value={props.draft.date}
              onChange={(e) => props.onChange({ date: e.target.value })}
            />
          </FormField>
          <FormField label="Time">
            <TimeInput
              value={props.draft.time}
              onChange={(e) => props.onChange({ time: e.target.value })}
            />
          </FormField>
          <FormField label="Format">
            <CustomSelect
              value={props.draft.telegramAdProductId}
              onChange={(v) => props.onChange({ telegramAdProductId: v })}
              options={[
                { value: "", label: "No format selected" },
                ...props.products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </FormField>
          <FormField label={`Price (${props.currency})`}>
            <Input
              value={props.draft.agreedPrice}
              inputMode="decimal"
              onChange={(e) => props.onChange({ agreedPrice: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              Recommended {props.draft.recommendedPrice} {props.currency} ·
              minimum {props.draft.minimumPrice} {props.currency}
            </p>
          </FormField>
          {toNumber(props.draft.agreedPrice) <
          toNumber(props.draft.minimumPrice) ? (
            <FormField label="Reason for price below minimum">
              <Input
                value={props.draft.manualPriceReason}
                onChange={(e) =>
                  props.onChange({ manualPriceReason: e.target.value })
                }
              />
            </FormField>
          ) : null}
        </div>
      </section>
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {hasLinkedPost ? (
              <FileText size={20} className="text-blue-400" />
            ) : (
              <Link2 size={20} className="text-neutral-500" />
            )}
            <div>
              <h4 className="font-medium text-white">Advertising post</h4>
              <p className="text-sm text-neutral-500">
                {props.draft.telegramPostId
                  ? "Published post linked"
                  : props.placement.managedPostId
                    ? "Managed post linked"
                    : "No post linked yet"}
              </p>
              {hasLinkedPost ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {systemPostUrl ? (
                    <a
                      href={systemPostUrl}
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Open in system <ExternalLink size={12} />
                    </a>
                  ) : null}
                  {!props.placement.deletedAt && telegramPostUrl ? (
                    <a
                      href={telegramPostUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      Open in Telegram <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              ) : null}
              <PlacementDeletionCountdown placement={props.placement} />
              {props.placement.telegramPost ? (
                <p className="mt-2 text-xs text-neutral-400">
                  {props.placement.telegramPost.viewsCount ?? 0} views ·{" "}
                  {props.placement.telegramPost.reactionsCount ?? 0} reactions ·{" "}
                  {props.placement.telegramPost.commentsCount ?? 0} comments ·{" "}
                  {props.placement.telegramPost.forwardsCount ?? 0} forwards
                </p>
              ) : null}
            </div>
          </div>
          <Button variant="secondary" onClick={() => void openPostEditor()}>
            {postEditorOpen
              ? "Cancel"
              : hasLinkedPost
                ? "Change post"
                : "Add post"}
          </Button>
        </div>
        {postEditorOpen ? (
          <div className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
            <div className="inline-grid grid-cols-2 rounded-md border border-neutral-700 bg-neutral-950 p-px">
              {(["select", "link"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={postInputMode === mode}
                  onClick={() => {
                    setPostInputMode(mode);
                    setPostError("");
                  }}
                  className={`h-8 rounded-[5px] px-3 text-xs font-medium transition ${
                    postInputMode === mode
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {mode === "select" ? "Select post" : "Paste link"}
                </button>
              ))}
            </div>
            {postInputMode === "select" ? (
              <FormField label="Published post">
                <Select
                  value={selectedPostId}
                  onChange={(event) => {
                    setSelectedPostId(event.target.value);
                    setPostError("");
                  }}
                  searchPlaceholder="Search all posts in this channel"
                >
                  <option value="">
                    {postOptionsLoading ? "Loading posts…" : "Select a post"}
                  </option>
                  {postOptions.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Telegram post link">
                <Input
                  value={postUrl}
                  onChange={(event) => {
                    setPostUrl(event.target.value);
                    setPostError("");
                  }}
                  placeholder="https://t.me/channel/123"
                  autoFocus
                />
              </FormField>
            )}
            {postError ? (
              <p className="text-sm text-rose-300">{postError}</p>
            ) : null}
          </div>
        ) : null}
      </section>
      {props.priceChanged && props.hasPayment ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-900/60 bg-blue-950/25 p-4">
          <input
            type="checkbox"
            checked={props.syncPayment}
            onChange={(e) => props.onSync(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-blue-100">
              Update the finance transaction too
            </span>
            <span className="mt-1 block text-sm text-blue-200/70">
              Set the linked transaction to {props.total} {props.currency} and
              recalculate allocations.
            </span>
          </span>
        </label>
      ) : null}
      <SaveFooter
        error={props.error}
        saving={props.saving || postSaving}
        onSave={saveChanges}
      />
    </div>
  );
}

function PaymentEditor(props: {
  payment: PaymentDraft;
  accounts: Account[];
  onChange: (p: Partial<PaymentDraft>) => void;
}) {
  const options = useMemo(
    () =>
      props.accounts
        .filter((a) => a.isActive || a.id === props.payment.accountId)
        .map((a) => ({
          value: a.id,
          label: `${accountDisplayName(a)} (${a.currency})`,
          iconUrl:
            a.iconPresentation?.type === "image"
              ? a.iconPresentation.url
              : undefined,
          iconEmoji:
            a.iconPresentation?.type === "unicode"
              ? a.iconPresentation.value
              : undefined,
          iconFallback: a.name,
        })),
    [props.accounts, props.payment.accountId],
  );
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <FormField label="Account">
        <CustomSelect
          value={props.payment.accountId}
          onChange={(accountId) => {
            const account = props.accounts.find((a) => a.id === accountId);
            props.onChange({
              accountId,
              currency: account?.currency ?? props.payment.currency,
            });
          }}
          options={options}
          placeholder={
            options.length ? "Select account" : "No accounts available"
          }
        />
      </FormField>
      <FormField label={`Amount (${props.payment.currency})`}>
        <Input
          value={props.payment.amount}
          inputMode="decimal"
          onChange={(e) => props.onChange({ amount: e.target.value })}
        />
      </FormField>
      <FormField label="Paid date">
        <DateInput
          value={props.payment.paidDate}
          onChange={(e) => props.onChange({ paidDate: e.target.value })}
        />
      </FormField>
      <FormField label="Paid time">
        <TimeInput
          value={props.payment.paidTime}
          onChange={(e) => props.onChange({ paidTime: e.target.value })}
        />
      </FormField>
      <div className="md:col-span-2 lg:col-span-4">
        <FormField label="Notes">
          <Input
            value={props.payment.notes}
            onChange={(e) => props.onChange({ notes: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}

function SaveFooter({
  error,
  saving,
  onSave,
}: {
  error: string;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
      <p className="text-sm text-rose-300">{error}</p>
      <Button onClick={() => void onSave()} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
function allocatePayment(amount: number, placements: PlacementDraft[]) {
  let remaining = amount;
  return placements.flatMap((p) => {
    const allocation = Math.max(
      0,
      Math.min(remaining, toNumber(p.agreedPrice)),
    );
    remaining -= allocation;
    return allocation > 0 ? [{ placementId: p.id, amount: allocation }] : [];
  });
}
function clientName(sale: TelegramAdSale) {
  return (
    sale.advertiserTelegramSnapshot ||
    sale.advertiserTelegram ||
    sale.advertiserNameSnapshot ||
    sale.advertiserName ||
    "Client"
  );
}
