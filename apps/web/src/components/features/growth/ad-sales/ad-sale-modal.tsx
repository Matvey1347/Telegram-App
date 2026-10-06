"use client";
import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { expandNetworkChannelIds } from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  FormField,
  Modal,
  ToggleRow,
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
    workspaceTimezone,
    onSearchAdvertisers,
    busy = false,
    headerAction,
    systemBotConnected,
    systemBotUsername,
    systemBotWorkspaceId,
  } = props;
  const {
    setAdvertiserTelegram,
    advertiserContact,
    setAdvertiserContact,
    setSelectedAdvertiser,
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
  } = useAdSaleModalController({
    ...props,
    productsByChannelId: providedProductsByChannelId,
  });
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
          <ModalDraftPicker
            drafts={pendingDrafts}
            titleFor={(draft) =>
              draft.advertiserContact || "Unfinished Ad Sale draft"
            }
            onContinue={continueDraft}
            onDelete={deleteDraft}
            onCreateNew={createNewDraft}
          />
        ) : (
          <>
            <div className="space-y-4 pr-1">
              <section className="space-y-3">
                <div className="grid gap-3 [&>div>span:first-child]:flex [&>div>span:first-child]:h-7 [&>div>span:first-child]:items-center xl:grid-cols-4 xl:items-start">
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

                  <div className="space-y-2">
                    <ToggleRow
                      checked={financeSkipped}
                      onChange={setFinanceSkipped}
                      label="Without financial transaction"
                      description="Create a free deal without a payment."
                      activeTone="blue"
                    />
                    {!financeSkipped ? (
                      <FormField label="Financial account" required>
                        <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
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
                        </div>
                      </FormField>
                    ) : null}
                  </div>

                  <FormField label="Sale origin">
                    <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
                      <CustomSelect
                        value={saleOrigin}
                        onChange={(value) =>
                          setSaleOrigin(value as TelegramAdSaleOrigin)
                        }
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

              <AdSalePlacementScope
                mode={channelSelectionMode}
                selectedNetworkId={selectedNetworkId}
                selectedChannelIds={selectedChannelIds}
                dateRange={placementDateRange}
                commonTime={commonTime}
                commonFormatName={commonFormatName}
                commonFormats={commonFormats}
                effectiveChannelIds={effectiveChannelIds}
                networks={networks}
                channels={channels}
                networkPricing={
                  !financeSkipped && placements.length >= 1 ? (
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
                workspaceId={systemBotWorkspaceId}
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
                          priceLocked={!financeSkipped && networkPricing.mode === "total"}
                          showPricing={!financeSkipped}
                          sharedPostActive={sharedPostActive}
                          publishedPosts={
                            publishedPostsByPlacement[postsKey] ?? []
                          }
                          postsLoading={
                            postsLoadingByPlacement[postsKey] ?? false
                          }
                          setPlacements={setPlacements}
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
            {quotePreview.errors.length ? (
              <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                {quotePreview.errors[0]}
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

    </>
  );
}
