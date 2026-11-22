"use client";
import { useEffect, useRef, useState } from "react";
import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { expandNetworkChannelIds } from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  FormField,
  Modal,
  ModalBackButton,
} from "@/components/ui/primitives";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { adSaleOriginOptions } from "./ad-sale-origin";
import { AdSalePlacementScope } from "./ad-sale-placement-scope";
import { AdSaleNetworkPricing } from "./ad-sale-network-pricing";
import { AdSaleSharedPost } from "./ad-sale-shared-post";
import { AdSaleClientField } from "./ad-sale-client-field";
import { applyProductToPlacement } from "./ad-sale-placement-draft";
import { AdSalePlacementCard } from "./ad-sale-placement-card";
import { FormSectionNumber } from "../form-section-number";
import { AdSaleModalSummary } from "./ad-sale-modal-summary";
import { addAdSalePlacementDate } from "@/lib/features/growth/ad-sales-bulk-date-builder";
import { Plus, Save } from "lucide-react";
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
    productsByChannelId: providedProductsByChannelId,
    onSearchAdvertisers,
    busy = false,
    headerAction,
    systemBotConnected,
    systemBotUsername,
    systemBotWorkspaceId,
    savedDrafts = [],
    onSaveDraft,
    onDeleteSavedDraft,
  } = props;
  const [savedDraftId, setSavedDraftId] = useState<string | undefined>();
  const [savingDraft, setSavingDraft] = useState(false);
  const [expandPlacementSettings, setExpandPlacementSettings] = useState(false);
  const [editingSavedDraft, setEditingSavedDraft] = useState(false);
  const [separateTimesByDate, setSeparateTimesByDate] = useState(false);
  const [separateFormatsByDate, setSeparateFormatsByDate] = useState(false);
  const previousPostModeRef = useRef<"shared" | "individual">("shared");
  const saleOriginManuallySelectedRef = useRef(false);
  useEffect(() => {
    if (open) {
      saleOriginManuallySelectedRef.current = false;
      previousPostModeRef.current = "shared";
    }
  }, [open]);
  const {
    setAdvertiserTelegram,
    advertiserContact,
    setAdvertiserContact,
    setSelectedAdvertiser,
    selectedAdvertiser,
    selectedAdvertiserId,
    setSelectedAdvertiserId,
    setAdvertiserMatches,
    assignedMemberId,
    setAssignedMemberId,
    saleOrigin,
    setSaleOrigin,
    financeSkipped,
    setFinanceSkipped,
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
    placementDates,
    setPlacementDates,
    postMode,
    setPostMode,
    placements,
    setPlacements,
    submissionError,
    pendingDrafts,
    publishedPostsByPlacement,
    postsLoadingByPlacement,
    networkPricing,
    quotePreview,
    paymentAmount,
    paymentCurrency,
    commonTime,
    effectiveChannelIds,
    commonFormats,
    commonFormatName,
    productsByChannelId,
    loadPublishedPosts,
    canSubmit,
    submit,
    sharedPostActive,
    continueDraft,
    deleteDraft,
    createNewDraft,
    showDraftPicker,
    currentDraft,
  } = useAdSaleModalController({
    ...props,
    productsByChannelId: providedProductsByChannelId,
  });
  const saveDraft = async () => {
    if (!onSaveDraft) return;
    setSavingDraft(true);
    try {
      const id = await onSaveDraft(
        currentDraft,
        savedDraftId ?? savedDrafts[0]?.id,
      );
      setSavedDraftId(id);
    } finally {
      setSavingDraft(false);
    }
  };
  const createSale = async () => {
    const published = await submit();
    if (published && savedDraftId && onDeleteSavedDraft) {
      await onDeleteSavedDraft(savedDraftId);
      setSavedDraftId(undefined);
    }
  };
  const selectedDates = [
    ...new Set(placements.map((item) => item.date)),
  ].sort();
  const dateTimeValues = selectedDates.map((date) => {
    const times = [...new Set(placements.filter((item) => item.date === date).map((item) => item.time))].sort();
    return times.length === 1 ? times[0] : times.join(",");
  });
  const dateFormatValues = selectedDates.map((date) => {
    const names = [...new Set(placements.filter((item) => item.date === date).map((item) => productsByChannelId[item.channelId]?.find((product) => product.id === item.productId)?.name ?? ""))].sort();
    return names.length === 1 ? names[0] : names.join(",");
  });
  const scheduleGroups = selectedDates.map((date) => {
    const datePlacements = placements.filter((item) => item.date === date);
    const times = [...new Set(datePlacements.map((item) => item.time))].sort();
    const formats = [...new Set(datePlacements.map((item) =>
      productsByChannelId[item.channelId]?.find((product) => product.id === item.productId)?.name ?? "",
    ))].sort();
    return {
      date,
      time: times.length > 1 ? "Mixed" : times[0] || "Not set",
      format: formats.length > 1 ? "Mixed" : formats[0] || undefined,
    };
  });
  const useSeparateTimesByDate = separateTimesByDate || new Set(dateTimeValues).size > 1;
  const useSeparateFormatsByDate = separateFormatsByDate || new Set(dateFormatValues).size > 1;
  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          setEditingSavedDraft(false);
          onClose();
        }}
        title="New ad sale"
        headerAction={headerAction}
        leadingHeaderAction={
          editingSavedDraft ? <ModalBackButton
            label="Back to saved drafts"
            onClick={() => {
              setEditingSavedDraft(false);
              showDraftPicker();
            }}
          />
          : null
        }
        size="2xl"
        extraViewportSpace
        footer={!pendingDrafts.length ? (
          <div className="grid grid-flow-col auto-cols-fr gap-2 [&>button]:whitespace-normal [&>button]:px-2">
            {onSaveDraft ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || savingDraft}
                onClick={() => void saveDraft()}
              >
                <Save size={16} aria-hidden="true" />
                {savingDraft ? "Saving draft…" : "Save draft"}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void createSale()}
              disabled={busy || !canSubmit}
              aria-label={submissionError ? "Retry sale creation" : "Create sale"}
            >
              <Plus size={16} aria-hidden="true" />
              {submissionError ? "Retry" : "Create sale"}
            </Button>
          </div>
        ) : undefined}
      >
        {pendingDrafts.length ? (
          <ModalDraftPicker
            drafts={pendingDrafts}
            titleFor={(draft) =>
              draft.advertiserContact || "Unfinished Ad Sale draft"
            }
            onContinue={(draft) => {
              setEditingSavedDraft(true);
              continueDraft(draft);
            }}
            onDelete={deleteDraft}
            onCreateNew={() => {
              setEditingSavedDraft(false);
              createNewDraft();
            }}
          />
        ) : (
          <>
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
              <div className="flex min-w-0 flex-col gap-4">
                <section className="order-1 min-w-0 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                  <SectionHeading
                    number="1"
                    title="Client and sale origin"
                  />
                  <div className="grid min-w-0 gap-3 md:grid-cols-3 [&>div>span:first-child]:flex [&>div>span:first-child]:h-7 [&>div>span:first-child]:items-center">
                    <AdSaleClientField
                      key={open ? "open" : "closed"}
                      contact={advertiserContact}
                      selectedAdvertiserId={selectedAdvertiserId}
                      onContactChange={setAdvertiserContact}
                      onTelegramChange={setAdvertiserTelegram}
                      onSearchAdvertisers={onSearchAdvertisers}
                      resolveExistingOnNewContact
                      onSelect={(advertiser) => {
                        setSelectedAdvertiser(advertiser);
                        setSelectedAdvertiserId(advertiser?.id ?? null);
                        setAdvertiserMatches([]);
                        if (
                          advertiser &&
                          advertiser.totalSalesCount > 0 &&
                          !saleOriginManuallySelectedRef.current
                        ) {
                          setSaleOrigin("REPEAT");
                        }
                      }}
                    />

                    <FormField label="Sale origin">
                      <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
                        <CustomSelect
                          value={saleOrigin}
                          onChange={(value) => {
                            saleOriginManuallySelectedRef.current = true;
                            setSaleOrigin(value as TelegramAdSaleOrigin);
                          }}
                          options={adSaleOriginOptions}
                        />
                      </div>
                    </FormField>
                    <FormField label="Member">
                      <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
                        <MemberSelect
                          value={assignedMemberId}
                          onChange={setAssignedMemberId}
                          defaultToCurrent
                        />
                      </div>
                    </FormField>
                  </div>
                </section>

                <div className="order-2 min-w-0 space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                  <SectionHeading
                    number="2"
                    title="Where and when will it run?"
                  />
                  <AdSalePlacementScope
                    mode={channelSelectionMode}
                    selectedNetworkId={selectedNetworkId}
                    selectedChannelIds={selectedChannelIds}
                    dateToAdd={placementDateRange.from}
                    placementDates={placementDates}
                    commonTime={commonTime}
                    commonFormatName={commonFormatName}
                    placements={placements}
                    separateTimesByDate={useSeparateTimesByDate}
                    separateFormatsByDate={useSeparateFormatsByDate}
                    commonFormats={commonFormats}
                    effectiveChannelIds={effectiveChannelIds}
                    networks={networks}
                    channels={channels}
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
                    onDateToAddChange={(date) =>
                      setPlacementDateRange({ from: date, to: date })
                    }
                    onSingleDateChange={(date) => {
                      setPlacementDateRange({ from: date, to: date });
                      setPlacementDates(date ? [date] : []);
                    }}
                    onUseSingleDate={(date) => {
                      setPlacementDateRange({ from: date, to: date });
                      setPlacementDates(date ? [date] : []);
                    }}
                    onAddDate={() => {
                      if (!placementDateRange.from) return;
                      setPlacementDates((current) =>
                        addAdSalePlacementDate(
                          current,
                          placementDateRange.from,
                        ),
                      );
                    }}
                    onRemoveDate={(date) =>
                      setPlacementDates((current) =>
                        current.filter((candidate) => candidate !== date),
                      )
                    }
                    onCommonTimeChange={(time) =>
                      setPlacements((current) =>
                        current.map((placement) => ({ ...placement, time })),
                      )
                    }
                    onDateTimeChange={(date, time) =>
                      setPlacements((current) =>
                        current.map((placement) =>
                          placement.date === date
                            ? { ...placement, time }
                            : placement,
                        ),
                      )
                    }
                    onSeparateTimesByDateChange={setSeparateTimesByDate}
                    onSeparateFormatsByDateChange={setSeparateFormatsByDate}
                    onDateFormatChange={(date, formatName) =>
                      setPlacements((current) =>
                        current.map((placement) => {
                          if (placement.date !== date) return placement;
                          const product = productsByChannelId[
                            placement.channelId
                          ]?.find((candidate) => candidate.name === formatName);
                          return product
                            ? applyProductToPlacement(placement, product)
                            : placement;
                        }),
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
                  <div id="ad-sale-placements" className="space-y-3 border-t border-neutral-800 pt-3">
                    <div className="flex min-w-0 flex-col items-start gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                      <h3 className="text-sm font-semibold text-white">Placements</h3>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
                          {placements.length} placement{placements.length === 1 ? "" : "s"}
                        </span>
                        {placements.length ? (
                          <button
                            type="button"
                            aria-expanded={expandPlacementSettings}
                            onClick={() => setExpandPlacementSettings((value) => !value)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-950/40 hover:text-blue-200"
                          >
                            {expandPlacementSettings ? "Hide" : "Show placements"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {placements.length ? expandPlacementSettings ? (
                      <div className="space-y-2">
                        {placements.map((placement) => {
                          const channel = channels.find((item) => item.id === placement.channelId);
                          const products = productsByChannelId[placement.channelId] ?? [];
                          const postsKey = `${placement.channelId}:${placement.date}`;
                          return (
                            <AdSalePlacementCard
                              key={placement.key}
                              placement={placement}
                              channel={channel}
                              products={products}
                              currency={paymentCurrency}
                              priceLocked={!financeSkipped && networkPricing.mode === "total"}
                              showPricing={!financeSkipped}
                              sharedPostActive={sharedPostActive}
                              individualPostMode={postMode === "individual"}
                              postEnabled={postMode !== "none"}
                              isFirstPlacement={placements[0]?.key === placement.key}
                              allDetailsOpen={false}
                              systemBotConnected={systemBotConnected}
                              systemBotUsername={systemBotUsername}
                              workspaceId={systemBotWorkspaceId}
                              publishedPosts={publishedPostsByPlacement[postsKey] ?? []}
                              postsLoading={postsLoadingByPlacement[postsKey] ?? false}
                              setPlacements={setPlacements}
                              onLoadPublishedPosts={(telegramPostUrl) => loadPublishedPosts(placement, telegramPostUrl)}
                              onManualPriceEdit={() => networkPricing.setMode("per-placement")}
                            />
                          );
                        })}
                      </div>
                    ) : null : (
                      <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
                        Select a network or one or more channels to generate booking rows.
                      </div>
                    )}
                  </div>
                </div>

                <section className="order-4 min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                  <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                    <SectionHeading number="3" title="Payment and financial tracking" />
                    <InlineSwitch label="Payment" ariaLabel="Financial transaction" checked={!financeSkipped} onChange={(checked) => setFinanceSkipped(!checked)} />
                  </div>
                  <div className="mt-4 space-y-3">
                    {!financeSkipped ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start [&>*]:min-w-0 [&_button]:max-w-full [&_button]:min-w-0">
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
                        <AdSaleNetworkPricing
                          mode={networkPricing.mode}
                          totalPrice={networkPricing.totalPrice}
                          recommendedTotal={networkPricing.recommendedTotal}
                          allocatedTotal={networkPricing.allocatedTotal}
                          currency={paymentCurrency}
                          placementCount={placements.length}
                          quotesReady={quotePreview.hasResolvedQuote}
                          onTotalPriceChange={networkPricing.setTotalPrice}
                        />
                      </div>
                    ) : null}
                  </div>
                </section>

                {postMode !== "none" ? (
                <section className="order-5 min-w-0 space-y-3 border-0 bg-transparent p-0 sm:rounded-xl sm:border sm:border-neutral-800 sm:bg-neutral-900/50 sm:p-4">
                  <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                  <div className="hidden sm:block"><SectionHeading number="4" title="Advertising post" /></div>
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-x-4 gap-y-2 min-[520px]:justify-end">
                      <InlineSwitch label="Separate posts" ariaLabel="Separate post per placement" checked={postMode === "individual"} onChange={(checked) => {
                        setPostMode(checked ? "individual" : "shared");
                        if (checked) setExpandPlacementSettings(true);
                      }} />
                      <InlineSwitch label="Post" ariaLabel="Advertising post" checked onChange={(checked) => {
                        if (!checked) {
                          previousPostModeRef.current = postMode === "individual" ? "individual" : "shared";
                          setPostMode("none");
                        }
                      }} />
                    </div>
                  </div>
                    <AdSaleSharedPost
                      placements={placements}
                      channels={channels}
                      mode={postMode}
                      systemBotConnected={systemBotConnected}
                      systemBotUsername={systemBotUsername}
                      workspaceId={systemBotWorkspaceId}
                      setPlacements={setPlacements}
                      onConfigureSeparatePosts={() => setExpandPlacementSettings(true)}
                    />
                </section>
                ) : (
                  <section className="order-5 min-w-0 rounded-none border-0 bg-transparent p-0 sm:rounded-xl sm:border sm:border-neutral-800 sm:bg-neutral-900/50 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="hidden sm:block"><SectionHeading number="4" title="Advertising post" /></div>
                      <InlineSwitch label="Post" ariaLabel="Advertising post" checked={false} onChange={() => setPostMode(previousPostModeRef.current)} />
                    </div>
                  </section>
                )}

              </div>
              <AdSaleModalSummary
                advertiser={
                  selectedAdvertiser?.id === selectedAdvertiserId
                    ? selectedAdvertiser.displayName
                    : props.initialAdvertiser?.id === selectedAdvertiserId
                      ? props.initialAdvertiser.displayName
                      : advertiserContact
                }
                clientAvatarUrl={
                  selectedAdvertiser?.id === selectedAdvertiserId
                    ? selectedAdvertiser.photoUrl
                    : props.initialAdvertiser?.id === selectedAdvertiserId
                      ? props.initialAdvertiser.photoUrl
                      : null
                }
                scheduleGroups={scheduleGroups}
                financeSkipped={financeSkipped}
                amount={paymentAmount}
                currency={paymentCurrency}
                submissionError={submissionError}
              />
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
            {quotePreview.errors.length ? (
              <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                {quotePreview.errors[0]}
              </p>
            ) : null}
          </>
        )}
      </Modal>
    </>
  );
}

function SectionHeading({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <FormSectionNumber>{number}</FormSectionNumber>
      <h3 className="min-w-0 text-sm font-semibold text-white">{title}</h3>
    </div>
  );
}

function InlineSwitch({
  label,
  ariaLabel,
  checked,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-sm text-neutral-300">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${checked ? "border-blue-500/70 bg-blue-500/30" : "border-neutral-700 bg-neutral-900"}`}
      >
        <span className={`absolute h-3.5 w-3.5 rounded-full bg-white transition ${checked ? "left-[17px]" : "left-1"}`} />
      </button>
    </div>
  );
}
