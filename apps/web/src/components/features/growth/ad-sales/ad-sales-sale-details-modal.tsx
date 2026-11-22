"use client";

import { useEffect, useState } from "react";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import { type SaleActionKey } from "./sale-status-actions";
import { Modal, ModalBackButton } from "@/components/ui/primitives";
import type { Account, TelegramChannel } from "@/lib/api";
import { currenciesApi } from "@/lib/api";
import { channelLocalDateKey, channelLocalTime, isValidZonedDateTimeInput, toNumber, zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { AdSaleSharedPostEditor } from "./ad-sale-shared-post-editor";
import type { AdSaleApplyAllChanges } from "./ad-sale-deal-placement-actions";
import type { RegisterPaymentPayload } from "./register-payment-form";
import { DealFinanceTransactionDeleteModal } from "./deal-finance-transaction-delete-modal";
import { adSaleClientName } from "./ad-sale-placement-value";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import { PlacementEditor, type PaymentDraft, type PlacementDraft, type PlacementPostOption } from "./ad-sales-sale-detail-editors";
import { DealDetailsSkeleton, DealOverview } from "./ad-sales-deal-overview";

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
    telegramAdProductId?: string | null;
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
  const [origin, setOrigin] = useState<TelegramAdSale["origin"]>("DIRECT");
  const [sellerMemberId, setSellerMemberId] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initializedSaleId, setInitializedSaleId] = useState<string | null>(
    null,
  );
  const [sharedPostOpen, setSharedPostOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open || !props.sale) return;
    // Initialize the form after the selected deal has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const paymentTimezone = props.sale.placements[0]?.timezone ?? "UTC";
    setPayments(
      (props.sale.payments ?? [])
        .filter((p) => p.status !== "VOIDED")
        .map((p) => ({
          id: p.id,
          accountId: p.accountId,
          amount: p.amount,
          currency: p.currency,
          paidDate: props.sale!.placements[0] ? channelLocalDateKey(props.sale!.placements[0].scheduledAt, paymentTimezone) : channelLocalDateKey(p.paidAt, paymentTimezone),
          paidTime: props.sale!.placements[0] ? channelLocalTime(props.sale!.placements[0].scheduledAt, paymentTimezone) : channelLocalTime(p.paidAt, paymentTimezone),
          notes: p.notes ?? "",
        })),
    );
    setInitializedSaleId(props.sale.id);
  }, [props.open, props.sale]);
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
  const paymentTimezone = placements[0]?.timezone ?? "UTC";
  const originalTotal = sale.placements.reduce(
    (sum, p) => sum + toNumber(p.agreedPrice),
    0,
  );
  const priceChanged = Math.abs(total - originalTotal) > 0.001;
  const channels = new Map(props.channels.map((c) => [c.id, c]));
  const syncPaymentSchedule = (first: PlacementDraft) => {
    setPayments((items) => items.map((payment) =>
      ({ ...payment, paidDate: first.date, paidTime: first.time }),
    ));
  };
  const changePlacement = (patch: Partial<PlacementDraft>) => {
    setPlacements((items) =>
      items.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)),
    );
    const first = placements[0];
    if (first && first.id === selectedId && (patch.date !== undefined || patch.time !== undefined)) {
      syncPaymentSchedule({ ...first, ...patch });
    }
  };
  const changePayment = (id: string, patch: Partial<PaymentDraft>) => {
    setPayments((items) =>
      items.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const applyChangesToAllPlacements = (changes: AdSaleApplyAllChanges) => {
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
          ...(changes.date !== undefined ? { date: changes.date } : {}),
          ...(changes.time !== undefined ? { time: changes.time } : {}),
          ...(product ? { telegramAdProductId: product.id } : {}),
        };
      });
      setPlacements(nextPlacements);
      if (changes.date !== undefined || changes.time !== undefined) {
        const first = nextPlacements[0];
        if (first) syncPaymentSchedule(first);
      }
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
  ) => {
    const placementsToSave = placements.filter((placementDraft) => {
      const original = sale.placements.find((item) => item.id === placementDraft.id);
      return !original ||
        (placementDraft.id === placementId && Boolean(managedPostDraft || postAttachment)) ||
        placementDraft.date !== channelLocalDateKey(original.scheduledAt, original.timezone) ||
        placementDraft.time !== channelLocalTime(original.scheduledAt, original.timezone) ||
        placementDraft.telegramAdProductId !== (original.telegramAdProductId ?? "") ||
        toNumber(placementDraft.agreedPrice) !== toNumber(original.agreedPrice);
    });
    const nextPayments = payments.map((payment) => {
      const original = sale.payments?.find((item) => item.id === payment.id);
      return priceChanged && payments.length === 1 && original &&
        toNumber(original.amount) === originalTotal &&
        toNumber(payment.amount) === toNumber(original.amount)
        ? { ...payment, amount: String(total) }
        : payment;
    });
    const paymentsToSave = nextPayments.filter((payment) => {
      const original = sale.payments?.find((item) => item.id === payment.id);
      return !original || payment.accountId !== original.accountId ||
        toNumber(payment.amount) !== toNumber(original.amount) ||
        payment.paidDate !== channelLocalDateKey(original.paidAt, paymentTimezone) ||
        payment.paidTime !== channelLocalTime(original.paidAt, paymentTimezone) ||
        payment.notes !== (original.notes ?? "");
    });
    setSaving(true);
    setError("");
    try {
      if (placementsToSave.some((item) => !isValidZonedDateTimeInput(item.date, item.time)) ||
          paymentsToSave.some((item) => !isValidZonedDateTimeInput(item.paidDate, item.paidTime))) {
        throw new Error("Choose a valid date and time before saving.");
      }
      await props.onSave(sale, {
        origin,
        sellerMemberId: sellerMemberId || null,
        buyerContact: buyerContact.trim(),
        advertiserId: selectedAdvertiserId,
        placements: placementsToSave.map((p) => {
          const original = sale.placements.find((item) => item.id === p.id);
          const sameSchedule = original &&
            p.date === channelLocalDateKey(original.scheduledAt, original.timezone) &&
            p.time === channelLocalTime(original.scheduledAt, original.timezone);
          const productId = p.telegramAdProductId || null;
          return {
            id: p.id,
            scheduledAt: sameSchedule ? original.scheduledAt : zonedDateTimeToUtc(p.date, p.time, p.timezone).toISOString(),
            timezone: p.timezone,
            agreedPrice: toNumber(p.agreedPrice),
            recommendedPrice: toNumber(p.recommendedPrice),
            minimumPrice: toNumber(p.minimumPrice),
            currency: original?.currency ?? sale.settlementCurrency,
            manualPriceReason: p.manualPriceReason.trim() || null,
            ...(productId !== (original?.telegramAdProductId ?? null) ? { telegramAdProductId: productId } : {}),
            ...(managedPostDraft && p.id === placementId ? { managedPostDraft } : {}),
            ...(postAttachment && p.id === placementId ? { postAttachment } : {}),
          };
        }),
        payments: paymentsToSave.map((p) => {
          const amount = toNumber(p.amount);
          const original = sale.payments?.find((item) => item.id === p.id);
          const sameTime = original && p.paidDate === channelLocalDateKey(original.paidAt, paymentTimezone) &&
            p.paidTime === channelLocalTime(original.paidAt, paymentTimezone);
          return {
            id: p.id,
            accountId: p.accountId,
            amount,
            currency: props.accounts.find((a) => a.id === p.accountId)?.currency ?? p.currency,
            paidAt: sameTime ? original.paidAt : zonedDateTimeToUtc(p.paidDate, p.paidTime, paymentTimezone).toISOString(),
            notes: p.notes.trim() || null,
            allocations: original?.allocations?.length &&
              toNumber(original.amount) === amount && !priceChanged
              ? original.allocations.map((allocation) => ({
                  placementId: allocation.telegramAdSalePlacementId,
                  amount: toNumber(allocation.amount),
                }))
              : allocatePayment(amount, placements),
          };
        }),
      });
      props.onClose();
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
            : `Deal · ${adSaleClientName(sale)}`
      }
      size="xl"
      leadingHeaderAction={
        placement || sharedPostOpen ? (
          <ModalBackButton
            label="Back to deal"
            onClick={() => {
              setSelectedId(null);
              setSharedPostOpen(false);
            }}
          />
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
          drafts={placements}
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
