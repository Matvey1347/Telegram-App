"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { ArrowLeft } from "lucide-react";
import { type SaleActionKey } from "./sale-status-actions";
import { Modal } from "@/components/ui/primitives";
import type { Account, TelegramChannel } from "@/lib/api";
import { currenciesApi } from "@/lib/api";
import { channelLocalDateKey, channelLocalTime, toNumber, zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { AdSaleSharedPostEditor } from "./ad-sale-shared-post-editor";
import type { AdSaleApplyAllChanges } from "./ad-sale-deal-placement-actions";
import type { RegisterPaymentPayload } from "./register-payment-form";
import { DealFinanceTransactionDeleteModal } from "./deal-finance-transaction-delete-modal";
import { adSaleClientName } from "./ad-sale-placement-value";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import { PlacementEditor, type PaymentDraft, type PlacementDraft, type PlacementPostOption } from "./ad-sales-sale-detail-editors";
import { DealDetailsSkeleton, DealOverview } from "./ad-sales-deal-overview";

type SaveDraft = {
  paymentsOnly?: boolean;
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
    managedPostDraft?: PlacementManagedPostDraft;
    postAttachment?: { telegramPostUrl?: string; telegramPostId?: string };
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
  sellerMemberId: string | null;
  buyerContact: string;
  advertiserId: string | null;
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
  onLoadPlacementPosts?: (
    placement: TelegramAdSale["placements"][number],
  ) => Promise<PlacementPostOption[]>;
  onUpdateSharedPost?: (
    sale: TelegramAdSale,
    draft: PlacementManagedPostDraft,
  ) => Promise<void>;
  onRecreateSharedPostViaBot?: (sale: TelegramAdSale) => Promise<void>;
  onDeletePayment?: (
    sale: TelegramAdSale,
    paymentId: string,
    options: { clearDealAmount: boolean },
  ) => Promise<void>;
  onCreatePayment?: (
    sale: TelegramAdSale,
    payload: RegisterPaymentPayload,
  ) => Promise<void>;
  onSearchAdvertisers?: (query: string) => Promise<import("@telegram-system/shared").TelegramAdvertiser[]>;
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  systemBotWorkspaceId?: string | null;
}) {
  const [placements, setPlacements] = useState<PlacementDraft[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [syncPayment, setSyncPayment] = useState(true);
  const [origin, setOrigin] = useState<TelegramAdSale["origin"]>("DIRECT");
  const [sellerMemberId, setSellerMemberId] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initializedSaleId, setInitializedSaleId] = useState<string | null>(
    null,
  );
  const preserveDraftOnSaleRefreshRef = useRef<string | null>(null);
  const [sharedPostOpen, setSharedPostOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      preserveDraftOnSaleRefreshRef.current = null;
      return;
    }
    if (!props.sale) return;
    if (preserveDraftOnSaleRefreshRef.current === props.sale.id) return;
    preserveDraftOnSaleRefreshRef.current = null;
    setOrigin(props.sale.origin);
    setSellerMemberId(
      props.sale.sellerMemberId ?? props.sale.assignedMemberId ?? "",
    );
    setBuyerContact(
      props.sale.advertiserId
        ? props.sale.advertiserTelegramSnapshot ??
            props.sale.advertiserTelegram ??
            props.sale.advertiserContact ??
            props.sale.advertiserNameSnapshot ??
            props.sale.advertiserName ??
            ""
        : "",
    );
    setSelectedAdvertiserId(props.sale.advertiserId);
    setSelectedId(null);
    setSharedPostOpen(false);
    setPaymentOpen(false);
    setPaymentToDelete(null);
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

  const applyChangesToAllPlacements = async (
    changes: AdSaleApplyAllChanges,
  ) => {
    try {
      const nextPlacements = placements.map((placementDraft) => {
        const placement = sale.placements.find(
          (item) => item.id === placementDraft.id,
        );
        const product =
          placement && changes.formatName
            ? props.productsByChannelId[placement.telegramChannelId]?.find(
                (candidate) => candidate.name === changes.formatName,
              )
            : undefined;
        if (changes.formatName && !product) {
          throw new Error(
            `Format ${changes.formatName} is unavailable for a placement.`,
          );
        }
        return {
          ...placementDraft,
          ...(changes.date ? { date: changes.date } : {}),
          ...(changes.time ? { time: changes.time } : {}),
          ...(product ? { telegramAdProductId: product.id } : {}),
        };
      });
      setPlacements(nextPlacements);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not apply changes.",
      );
    }
  };

  const save = async (
    placementId?: string,
    managedPostDraft?: PlacementManagedPostDraft,
    postAttachment?: { telegramPostUrl?: string; telegramPostId?: string },
    paymentsOnly = false,
  ) => {
    const placementsToSave = paymentsOnly
      ? []
      : placementId
      ? placements.filter((placement) => placement.id === placementId)
      : placements.filter((placementDraft) => {
          const original = sale.placements.find(
            (item) => item.id === placementDraft.id,
          );
          if (!original) return true;
          return (
            placementDraft.date !==
              channelLocalDateKey(original.scheduledAt, original.timezone) ||
            placementDraft.time !==
              channelLocalTime(original.scheduledAt, original.timezone) ||
            placementDraft.telegramAdProductId !==
              (original.telegramAdProductId ?? "") ||
            toNumber(placementDraft.agreedPrice) !==
              toNumber(original.agreedPrice)
          );
        });
    const paymentsToSave = placementId
      ? priceChanged && syncPayment
        ? payments
        : []
      : payments.filter((paymentDraft) => {
          const original = sale.payments?.find(
            (item) => item.id === paymentDraft.id,
          );
          if (!original) return true;
          return (
            paymentDraft.accountId !== original.accountId ||
            toNumber(paymentDraft.amount) !== toNumber(original.amount) ||
            paymentDraft.paidDate !== original.paidAt.slice(0, 10) ||
            paymentDraft.paidTime !== original.paidAt.slice(11, 16) ||
            paymentDraft.notes !== (original.notes ?? "")
          );
        });
    setSaving(true);
    setError("");
    try {
      if (paymentsOnly) {
        preserveDraftOnSaleRefreshRef.current = sale.id;
      }
      await props.onSave(sale, {
        paymentsOnly,
        origin: paymentsOnly ? sale.origin : origin,
        sellerMemberId: paymentsOnly
          ? (sale.sellerMemberId ?? sale.assignedMemberId ?? null)
          : sellerMemberId || null,
        buyerContact: paymentsOnly
          ? sale.advertiserId
            ? sale.advertiserTelegramSnapshot ??
              sale.advertiserTelegram ??
              sale.advertiserContact ??
              sale.advertiserNameSnapshot ??
              sale.advertiserName ??
              ""
            : ""
          : buyerContact.trim(),
        advertiserId: paymentsOnly ? sale.advertiserId : selectedAdvertiserId,
        placements: placementsToSave.map((p) => ({
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
          ...(managedPostDraft && p.id === placementId
            ? { managedPostDraft }
            : {}),
          ...(postAttachment && p.id === placementId ? { postAttachment } : {}),
        })),
        payments: paymentsToSave.map((p, index) => {
          const amount =
            placementId && priceChanged && syncPayment && index === 0
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
      if (!paymentsOnly) props.onClose();
    } catch (cause) {
      if (paymentsOnly) preserveDraftOnSaleRefreshRef.current = null;
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
            : `Deal · ${adSaleClientName(sale)}`
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
          key={placement.id}
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
          onLoadPosts={() =>
            props.onLoadPlacementPosts?.(placement) ?? Promise.resolve([])
          }
          onSave={(managedPostDraft, postAttachment) =>
            save(placement.id, managedPostDraft, postAttachment)
          }
          saving={saving}
          error={error}
          workspaceId={props.systemBotWorkspaceId}
          systemBotUsername={props.systemBotUsername}
          systemBotConnected={props.systemBotConnected}
        />
      ) : (
        <DealOverview
          sale={sale}
          origin={origin}
          sellerMemberId={sellerMemberId}
          buyerContact={buyerContact}
          selectedAdvertiserId={selectedAdvertiserId}
          selectedClient={
            sale.advertiserId
              ? {
                  id: sale.advertiserId,
                  displayName:
                    sale.advertiser?.displayName ??
                    sale.advertiserNameSnapshot ??
                    sale.advertiserName,
                  telegramUsername:
                    sale.advertiser?.telegramUsername ??
                    sale.advertiserTelegramSnapshot ??
                    sale.advertiserTelegram,
                  photoUrl: sale.advertiser?.photoUrl,
                }
              : null
          }
          onSearchAdvertisers={props.onSearchAdvertisers}
          onSelectAdvertiser={(advertiser) => {
            setSelectedAdvertiserId(advertiser?.id ?? null);
            if (advertiser) {
              setBuyerContact(
                advertiser.telegramUsername ??
                  advertiser.email ??
                  advertiser.phone ??
                  "",
              );
            }
          }}
          channels={channels}
          payments={payments}
          accounts={props.accounts}
          paymentOpen={paymentOpen}
          onOrigin={setOrigin}
          onSellerMember={setSellerMemberId}
          onBuyerContact={setBuyerContact}
          onPlacement={setSelectedId}
          onSharedPost={
            props.onUpdateSharedPost ? () => setSharedPostOpen(true) : undefined
          }
          productsByChannelId={props.productsByChannelId}
          onApplyAll={applyChangesToAllPlacements}
          onTogglePayment={() => setPaymentOpen((v) => !v)}
          onCreatePayment={
            props.onCreatePayment
              ? async (payload) => {
                  await props.onCreatePayment?.(sale, payload);
                  setPaymentOpen(false);
                }
              : undefined
          }
          onPayment={changePayment}
          onDeletePayment={
            props.onDeletePayment ? setPaymentToDelete : undefined
          }
          onAction={(action, placement) => props.onAction(sale, action, placement)}
          onSave={save}
          onSavePayment={() => save(undefined, undefined, undefined, true)}
          saving={saving}
          error={error}
        />
      )}
      {paymentToDelete ? (
        <DealFinanceTransactionDeleteModal
          onClose={() => setPaymentToDelete(null)}
          dealAmount={sale.totalAgreedAmount ?? "0"}
          currency={sale.settlementCurrency}
          onConfirm={async (clearDealAmount) => {
            if (!props.onDeletePayment) return;
            setSaving(true);
            setError("");
            try {
              await props.onDeletePayment(sale, paymentToDelete, {
                clearDealAmount,
              });
              setPayments((items) =>
                items.filter((payment) => payment.id !== paymentToDelete),
              );
              setPaymentOpen(false);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not delete the finance transaction.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </Modal>
  );
}
function allocatePayment(amount: number, placements: PlacementDraft[]) {
  if (
    placements.length &&
    placements.every((placement) => toNumber(placement.agreedPrice) <= 0)
  ) {
    const minorUnitAmount = Math.round(amount * 100);
    const base = Math.floor(minorUnitAmount / placements.length);
    return placements.map((placement, index) => ({
      placementId: placement.id,
      amount:
        (base +
          (index === placements.length - 1
            ? minorUnitAmount - base * placements.length
            : 0)) /
        100,
    }));
  }
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
