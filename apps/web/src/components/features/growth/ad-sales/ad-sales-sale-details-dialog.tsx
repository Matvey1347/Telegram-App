"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { TelegramAdProduct, TelegramAdSale } from "@telegram-system/shared";
import type { Account, TelegramChannel } from "@/lib/api";
import { getAllTelegramChannelPosts, telegramAdSalesApi, telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { invalidateTelegramAdSalesDerivedQueries } from "@/lib/features/growth/telegram-ad-sales-query";
import { SaleDetailsModal } from "./ad-sales-sale-details-modal";

type PostEditorPlacement = { saleId: string; placementId: string };

export function AdSalesSaleDetailsDialog({
  selectedSale,
  selectedSaleId,
  setSelectedSaleId,
  accounts,
  channels,
  productsByChannelId,
  settings,
  rates,
  queryClient,
  setPaymentSale,
  setPostEditorPlacement,
  setPostTitle,
  setPostText,
  setPostImages,
  refreshSaleAfterMutation,
}: {
  selectedSale: TelegramAdSale | null;
  selectedSaleId: string | null;
  setSelectedSaleId: Dispatch<SetStateAction<string | null>>;
  accounts: Account[];
  channels: TelegramChannel[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  settings: ComponentProps<typeof SaleDetailsModal>["settings"];
  rates: ComponentProps<typeof SaleDetailsModal>["rates"];
  queryClient: QueryClient;
  setPaymentSale: Dispatch<SetStateAction<TelegramAdSale | null>>;
  setPostEditorPlacement: Dispatch<SetStateAction<PostEditorPlacement | null>>;
  setPostTitle: Dispatch<SetStateAction<string>>;
  setPostText: Dispatch<SetStateAction<string>>;
  setPostImages: Dispatch<SetStateAction<string>>;
  refreshSaleAfterMutation: (saleId: string, channelIds: string[]) => Promise<void>;
}) {
  return (
      <SaleDetailsModal
        sale={selectedSale}
        open={Boolean(selectedSaleId)}
        loading={Boolean(selectedSaleId) && !selectedSale}
        onClose={() => setSelectedSaleId(null)}
        accounts={accounts as Account[]}
        channels={channels}
        productsByChannelId={productsByChannelId}
        settings={settings}
        rates={rates}
        onSave={async (sale, draft) => {
          let feedbackStarted = false;
          const silentAfterFirstMutation = () => {
            const silent = feedbackStarted;
            feedbackStarted = true;
            return silent;
          };
          if (
            draft.origin !== sale.origin ||
            draft.assignedMemberId !== sale.assignedMemberId ||
            draft.buyerContact !==
              (sale.advertiserTelegramSnapshot ??
                sale.advertiserTelegram ??
                sale.advertiserContact ??
                sale.advertiserNameSnapshot ??
                sale.advertiserName ??
                "")
          ) {
            const buyerChanged =
              draft.buyerContact !==
              (sale.advertiserTelegramSnapshot ??
                sale.advertiserTelegram ??
                sale.advertiserContact ??
                sale.advertiserNameSnapshot ??
                sale.advertiserName ??
                "");
            await telegramAdSalesApi.updateSale(
              sale.id,
              {
                origin: draft.origin,
                assignedMemberId: draft.assignedMemberId,
                ...(buyerChanged
                  ? {
                      advertiserId: null,
                      advertiserName:
                        draft.buyerContact.replace(/^@/, "") || "Advertiser",
                      advertiserContact: draft.buyerContact || null,
                      advertiserTelegram: draft.buyerContact.startsWith("@")
                        ? draft.buyerContact
                        : null,
                    }
                  : {}),
              },
              silentAfterFirstMutation(),
            );
          }
          const targetCurrency =
            draft.payments[0]?.currency ?? sale.settlementCurrency;
          if (targetCurrency !== sale.settlementCurrency) {
            await telegramAdSalesApi.updateSale(
              sale.id,
              {
                settlementCurrency: targetCurrency,
              },
              silentAfterFirstMutation(),
            );
          }
          for (const placement of draft.placements) {
            await telegramAdSalesApi.updatePlacement(
              sale.id,
              placement.id,
              {
                scheduledAt: placement.scheduledAt,
                timezone: placement.timezone,
                agreedPrice: placement.agreedPrice,
                recommendedPrice: placement.recommendedPrice,
                minimumPrice: placement.minimumPrice,
                currency: placement.currency,
                manualPriceReason: placement.manualPriceReason || null,
                telegramAdProductId: placement.telegramAdProductId,
                managedPostId: placement.managedPostId,
              },
              silentAfterFirstMutation(),
            );
          }
          for (const payment of draft.payments) {
            await telegramAdSalesApi.updatePayment(
              sale.id,
              payment.id,
              {
                accountId: payment.accountId,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt,
                notes: payment.notes || null,
                allocations: payment.allocations,
              },
              silentAfterFirstMutation(),
            );
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await invalidateTelegramAdSalesDerivedQueries(queryClient, {
            finance: true,
            dashboard: true,
            analytics: true,
          });
        }}
        onUpdateSharedPost={async (sale, draft) => {
          const linkedPlacements = sale.placements.filter(
            (placement) => placement.managedPostId,
          );
          if (linkedPlacements.length !== sale.placements.length) {
            throw new Error(
              "Every placement must have a configured post before the shared post can be updated.",
            );
          }
          await Promise.all(
            linkedPlacements.map((placement, index) =>
              telegramChannelsApi.updateManagedPost(
                placement.telegramChannelId,
                placement.managedPostId!,
                {
                  title: draft.title,
                  text: draft.text,
                  imageUrls: draft.imageUrls,
                  buttonRows: draft.buttonRows,
                  inPlaceOnly: true,
                },
                index > 0,
              ),
            ),
          );
          await Promise.all([
            refreshSaleAfterMutation(
              sale.id,
              linkedPlacements.map((placement) => placement.telegramChannelId),
            ),
            ...linkedPlacements.map((placement) =>
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(placement.telegramChannelId),
              }),
            ),
          ]);
        }}
        onRecreateSharedPostViaBot={async (sale) => {
          await telegramAdSalesApi.recreateScheduledPostsViaBot(sale.id);
          await Promise.all([
            refreshSaleAfterMutation(
              sale.id,
              sale.placements.map((placement) => placement.telegramChannelId),
            ),
            ...sale.placements.map((placement) =>
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(placement.telegramChannelId),
              }),
            ),
          ]);
        }}
        onAction={async (sale, action, placement) => {
          const placementId = placement?.id;
          if (action === "confirm") {
            await telegramAdSalesApi.confirmSale(sale.id);
          } else if (action === "reserve") {
            await telegramAdSalesApi.reserveSale(sale.id, {
              placements: sale.placements.map((item) => ({
                placementId: item.id,
                scheduledAt: item.scheduledAt,
              })),
            });
          } else if (action === "cancel") {
            if (placementId) {
              await telegramAdSalesApi.cancelPlacement(
                sale.id,
                placementId,
                {},
              );
            } else {
              await telegramAdSalesApi.cancelSale(sale.id);
            }
          } else if (action === "register-payment") {
            setPaymentSale(sale);
            setSelectedSaleId(null);
            return;
          } else if (action === "create-post" && placementId) {
            setPostEditorPlacement({ saleId: sale.id, placementId });
            setPostTitle(sale.title || sale.advertiserName);
            setPostText("");
            setPostImages("");
            return;
          } else if (action === "schedule" && placementId) {
            await telegramAdSalesApi.schedulePlacement(
              sale.id,
              placementId,
              {},
            );
          } else if (action === "publish" && placementId) {
            await telegramAdSalesApi.publishPlacement(sale.id, placementId, {});
          } else if (action === "reschedule" && placementId) {
            await telegramAdSalesApi.reschedulePlacement(sale.id, placementId, {
              scheduledAt: placement.scheduledAt,
            });
          } else if (action === "complete-permanent" && placementId) {
            await telegramAdSalesApi.completePermanentPlacement(
              sale.id,
              placementId,
              {},
            );
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
        }}
        onLoadPlacementPosts={async (placement) => {
          const posts = await getAllTelegramChannelPosts(
            placement.telegramChannelId,
          );
          return posts.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              `Post ${post.telegramMessageId}`,
            publishedAt: post.postDate,
          }));
        }}
        onAttachPost={async (sale, placement, post) => {
          await telegramAdSalesApi.attachManagedPost(sale.id, placement.id, {
            ...post,
          });
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
        }}
      />

  );
}
