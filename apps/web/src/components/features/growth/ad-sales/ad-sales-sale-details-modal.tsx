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
import {
  PaymentEditor,
  PlacementDeletionCountdown,
  PlacementEditor,
  SaveFooter,
  type PaymentDraft,
  type PlacementDraft,
  type PlacementPostOption,
} from "./ad-sales-sale-detail-editors";

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
  onRecreateSharedPostViaBot?: (sale: TelegramAdSale) => Promise<void>;
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
          onRecreateViaBot={() =>
            props.onRecreateSharedPostViaBot
              ? props.onRecreateSharedPostViaBot(sale)
              : Promise.reject(new Error("Bot recreation is unavailable."))
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
                        p.publishedAt || p.telegramPostId || p.managedPostId
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {p.publishedAt || p.telegramPostId
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
