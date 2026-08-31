"use client";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdProduct,
  TelegramAdQuotePreviewBatchResponse,
  TelegramAdQuotePreviewRequest,
  TelegramAdSale,
  TelegramAdSaleOrigin,
  TelegramAdvertiser,
  TelegramAdStructuredError,
} from "@telegram-system/shared";
import type {
  Account,
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import {
  channelLocalDateKey,
  expandNetworkChannelIds,
  toNumber,
  zonedDateTimeToUtc,
  isValidZonedDateTimeInput,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  FormField,
  IconButton,
  Input,
  Modal,
  Skeleton,
} from "@/components/ui/primitives";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { adSaleOriginOptions } from "./ad-sale-origin";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
import type {
  PublishedPostOption,
  QuoteRequestDraft,
  SalePlacementDraft,
} from "./ad-sale-types";
import { expandAdSaleDateRange } from "@/lib/features/growth/ad-sales-bulk-date-builder";
import { formatDateWithWeekday } from "@/lib/date-format";
import { AdSalePlacementScope } from "./ad-sale-placement-scope";
import {
  AdSaleNetworkPricing,
  useAdSaleNetworkPricing,
  type AdSalePriceAllocation,
} from "./ad-sale-network-pricing";
import { AdSaleSharedPost } from "./ad-sale-shared-post";
import { AdSaleClientField } from "./ad-sale-client-field";
import {
  applyProductToPlacement,
  commonAdSaleFormats,
  createPlacementDraft,
  productPrice,
  resolveAdSaleCurrency,
} from "./ad-sale-placement-draft";
import { AdSalePlacementCard } from "./ad-sale-placement-card";
import {
  hasMeaningfulAdSaleDraft,
  readAdSaleModalDrafts,
  removeAdSaleModalDraft,
  writeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";
import {
  useAdSaleModalController,
  type AdSaleModalProps,
} from "./ad-sale-modal-controller";

export type { SalePlacementDraft } from "./ad-sale-types";

export { defaultAdSaleAccountId } from "./ad-sale-modal-controller";

export function AdSaleModal(props: AdSaleModalProps) {
  const {
    open,
    onClose,
    accounts,
    channels,
    networks,
    productsByChannelId,
    defaultCurrency,
    workspaceTimezone,
    onLoadAvailableSlots,
    onLoadPublishedPosts,
    onRequestQuotePreview,
    onSearchAdvertisers,
    onSubmit,
    busy = false,
    initialChannelId,
    initialScheduledAt,
    initialInventoryOpportunityKey,
    headerAction,
    sessionOpen,
    systemBotConnected,
    systemBotUsername,
    onSystemBotReturn,
    onPrepareSystemBot,
    onSendSystemBotPost,
  } = props;
  const {
    advertiserTelegram,
    setAdvertiserTelegram,
    advertiserContact,
    setAdvertiserContact,
    selectedAdvertiser,
    setSelectedAdvertiser,
    selectedAdvertiserId,
    setSelectedAdvertiserId,
    advertiserMatches,
    setAdvertiserMatches,
    assignedMemberId,
    setAssignedMemberId,
    saleOrigin,
    setSaleOrigin,
    accountId,
    setAccountId,
    accountManuallySelectedRef,
    channelSelectionMode,
    setChannelSelectionMode,
    selectedNetworkId,
    setSelectedNetworkId,
    selectedChannelIds,
    setSelectedChannelIds,
    placementDateRange,
    setPlacementDateRange,
    postMode,
    setPostMode,
    placements,
    setPlacements,
    submissionError,
    pendingDrafts,
    slotPickerPlacementKey,
    setSlotPickerPlacementKey,
    slotPickerLoading,
    slotPickerError,
    publishedPostsByPlacement,
    postsLoadingByPlacement,
    paymentAmount,
    networkPricing,
    quotePreview,
    effectiveChannelIds,
    paymentCurrency,
    commonTime,
    commonFormats,
    commonFormatName,
    loadPublishedPosts,
    canSubmit,
    openSlotPicker,
    applySlot,
    submit,
    slotPickerPlacement,
    slotsByDate,
    sharedPostActive,
    pendingDraftSummaries,
    continueDraft,
    deleteDraft,
    createNewDraft,
  } = useAdSaleModalController(props);
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="New ad sale"
        headerAction={headerAction}
        size="xl"
      >
        {pendingDrafts.length ? (
          <div className="space-y-3">
            {pendingDraftSummaries.map(({ draft, ...summary }) => (
              <section
                key={draft.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-700/60 bg-amber-950/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white">
                    {(draft.advertiserContact ?? "").trim() ||
                      "Unfinished Ad Sale draft"}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-neutral-300">
                      {draft.placements.length} placement
                      {draft.placements.length === 1 ? "" : "s"}
                    </span>
                    <span className="font-medium text-emerald-300">
                      {summary.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {summary.currency}
                    </span>
                    {summary.draftChannels.length ? (
                      <span
                        className={`flex max-w-xl items-center text-neutral-400 ${summary.draftChannels.length > 1 ? "-space-x-1" : "gap-1.5"}`}
                        aria-label={`${summary.draftChannels.length} channels selected`}
                      >
                        {summary.draftChannels.map((channel) => (
                          <span
                            key={channel.id}
                            title={channel.title}
                            className="inline-flex items-center gap-1.5"
                          >
                            <TelegramEntityAvatar
                              imageUrl={channel.photoUrl}
                              kind="channel"
                              alt={channel.title}
                              size="xs"
                            />
                            {summary.draftChannels.length === 1
                              ? channel.title
                              : null}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-neutral-400">
                        No channels selected
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IconButton
                    type="button"
                    kind="delete"
                    aria-label="Delete draft"
                    title="Delete draft"
                    onClick={() => deleteDraft(draft)}
                  />
                  <IconButton
                    type="button"
                    aria-label="Continue draft"
                    title="Continue editing draft"
                    onClick={() => continueDraft(draft)}
                  />
                </div>
              </section>
            ))}
            <div className="flex justify-end">
              <Button type="button" onClick={createNewDraft}>
                <Plus size={15} /> Create new
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 pr-1">
              <section className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-4 xl:items-start">
                  <AdSaleClientField
                    key={open ? "open" : "closed"}
                    contact={advertiserContact}
                    selectedAdvertiserId={selectedAdvertiserId}
                    onContactChange={setAdvertiserContact}
                    onTelegramChange={setAdvertiserTelegram}
                    onSearchAdvertisers={onSearchAdvertisers}
                    onSelect={(advertiser) => {
                      setSelectedAdvertiser(advertiser);
                      setSelectedAdvertiserId(advertiser?.id ?? null);
                      setAdvertiserMatches([]);
                    }}
                  />

                  <FormField label="Financial account" required>
                    <CustomSelect
                      value={accountId}
                      onChange={(nextAccountId) => {
                        accountManuallySelectedRef.current = true;
                        setAccountId(nextAccountId);
                      }}
                      placeholder="Select account"
                      options={accounts
                        .filter((account) => account.isActive)
                        .map((account) => ({
                          value: account.id,
                          label: `${accountDisplayName(account)} (${account.currency})`,
                          iconUrl:
                            account.iconPresentation?.type === "image"
                              ? account.iconPresentation.url
                              : undefined,
                          iconEmoji:
                            account.iconPresentation?.type === "unicode"
                              ? account.iconPresentation.value
                              : undefined,
                          iconFallback: account.name,
                        }))}
                    />
                  </FormField>

                  <FormField label="Sale origin">
                    <CustomSelect
                      value={saleOrigin}
                      onChange={(value) =>
                        setSaleOrigin(value as TelegramAdSaleOrigin)
                      }
                      options={adSaleOriginOptions}
                    />
                  </FormField>
                  <FormField label="Member">
                    <MemberSelect
                      value={assignedMemberId}
                      onChange={setAssignedMemberId}
                      defaultToCurrent
                    />
                  </FormField>
                </div>
              </section>

              <AdSalePlacementScope
                mode={channelSelectionMode}
                selectedNetworkId={selectedNetworkId}
                selectedChannelIds={selectedChannelIds}
                dateRange={placementDateRange}
                commonTime={commonTime}
                commonFormatName={commonFormatName}
                commonFormats={commonFormats}
                networks={networks}
                channels={channels}
                networkPricing={
                  placements.length >= 2 ? (
                    <AdSaleNetworkPricing
                      mode={networkPricing.mode}
                      totalPrice={networkPricing.totalPrice}
                      recommendedTotal={networkPricing.recommendedTotal}
                      allocatedTotal={networkPricing.allocatedTotal}
                      currency={paymentCurrency}
                      placementCount={placements.length}
                      onModeChange={networkPricing.setMode}
                      onTotalPriceChange={networkPricing.setTotalPrice}
                    />
                  ) : null
                }
                onModeChange={(mode) => {
                  if (mode === "channels" && selectedNetworkId) {
                    setSelectedChannelIds(
                      expandNetworkChannelIds({
                        selectedChannelIds: [],
                        selectedNetworkId,
                        networks,
                      }),
                    );
                  }
                  setChannelSelectionMode(mode);
                }}
                onNetworkChange={setSelectedNetworkId}
                onChannelsChange={setSelectedChannelIds}
                onDateRangeChange={setPlacementDateRange}
                onCommonTimeChange={(time) =>
                  setPlacements((current) =>
                    current.map((placement) => ({ ...placement, time })),
                  )
                }
                onCommonFormatChange={(formatName) =>
                  setPlacements((current) =>
                    current.map((placement) => {
                      const product = productsByChannelId[
                        placement.channelId
                      ]?.find((candidate) => candidate.name === formatName);
                      return product
                        ? applyProductToPlacement(placement, product)
                        : placement;
                    }),
                  )
                }
              />

              <AdSaleSharedPost
                placements={placements}
                channels={channels}
                mode={postMode}
                systemBotConnected={systemBotConnected}
                systemBotUsername={systemBotUsername}
                onSystemBotReturn={onSystemBotReturn}
                onPrepareSystemBot={onPrepareSystemBot}
                onSendSystemBotPost={onSendSystemBotPost}
                onModeChange={setPostMode}
                setPlacements={setPlacements}
              />

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-400">
                      Placements
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Choose one date for a single placement or a range for
                      multiple placements.
                    </p>
                  </div>
                  <div className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
                    {placements.length} placement
                    {placements.length === 1 ? "" : "s"}
                  </div>
                </div>

                {placements.length ? (
                  <div className="space-y-2">
                    {placements.map((placement) => {
                      const channel = channels.find(
                        (item) => item.id === placement.channelId,
                      );
                      const products =
                        productsByChannelId[placement.channelId] ?? [];
                      const postsKey = `${placement.channelId}:${placement.date}`;

                      return (
                        <AdSalePlacementCard
                          key={placement.key}
                          placement={placement}
                          channel={channel}
                          products={products}
                          currency={paymentCurrency}
                          priceLocked={networkPricing.mode === "total"}
                          sharedPostActive={sharedPostActive}
                          publishedPosts={
                            publishedPostsByPlacement[postsKey] ?? []
                          }
                          postsLoading={
                            postsLoadingByPlacement[postsKey] ?? false
                          }
                          setPlacements={setPlacements}
                          onFindNearbyDate={() =>
                            void openSlotPicker(placement)
                          }
                          onLoadPublishedPosts={(telegramPostUrl) =>
                            loadPublishedPosts(placement, telegramPostUrl)
                          }
                          onManualPriceEdit={() =>
                            networkPricing.setMode("per-placement")
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
                    Select a network or one or more channels to generate booking
                    rows.
                  </div>
                )}
              </section>
            </div>

            {submissionError ? (
              <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                {submissionError}
              </p>
            ) : null}
            {quotePreview.limitExceeded ? (
              <p className="mt-4 rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                This selection requires{" "}
                {quotePreview.requestCount.toLocaleString()} price quotes.
                Reduce the channels or dates to 10,000 placements or fewer.
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={busy || !canSubmit}
                >
                  {submissionError ? "Retry failed operations" : "Create sale"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(slotPickerPlacement)}
        onClose={() => setSlotPickerPlacementKey(null)}
        title="Choose a nearby date"
        size="xl"
      >
        <p className="mb-4 text-sm text-neutral-400">
          {slotPickerPlacement
            ? `Available dates for ${channels.find((channel) => channel.id === slotPickerPlacement.channelId)?.title ?? "this channel"}. Choose the time manually in the placement.`
            : "Choose an available date. Time stays unchanged."}
        </p>
        {slotPickerLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : slotPickerError ? (
          <p className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">
            {slotPickerError}
          </p>
        ) : slotsByDate.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {slotsByDate.map(([date, slots]) => {
              const isToday =
                date === channelLocalDateKey(new Date(), workspaceTimezone);
              const isPast =
                date < channelLocalDateKey(new Date(), workspaceTimezone);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => applySlot(slots[0])}
                  className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
                    isPast
                      ? "border-rose-700/80 bg-rose-950/30 hover:border-rose-500"
                      : "border-emerald-700/80 bg-emerald-950/30 hover:border-emerald-500"
                  } ${isToday ? "ring-1 ring-emerald-400" : ""}`}
                >
                  <span className="block text-sm font-medium text-white">
                    {formatDateWithWeekday(`${date}T12:00:00`)}
                  </span>
                  <span
                    className={`mt-2 block text-xs ${isPast ? "text-rose-300" : "text-emerald-300"}`}
                  >
                    {isToday
                      ? "Today · Available"
                      : isPast
                        ? "Past date"
                        : "Available"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
            No available slots were found in this period.
          </p>
        )}
      </Modal>
    </>
  );
}
