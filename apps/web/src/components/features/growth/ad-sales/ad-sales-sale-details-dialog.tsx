"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import type { Account, TelegramChannel } from "@/lib/api";
import {
  getAllTelegramChannelPosts,
  telegramAdSalesApi,
  telegramChannelsApi,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import {
  invalidateTelegramAdSalesDerivedQueries,
  reconcileTelegramAdSaleCache,
} from "@/lib/features/growth/telegram-ad-sales-query";
import { useAppToast } from "@/providers/toast-provider";
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
  systemBotConnected,
  systemBotUsername,
  systemBotWorkspaceId,
  queryClient,
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
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  systemBotWorkspaceId?: string | null;
  queryClient: QueryClient;
  setPostEditorPlacement: Dispatch<SetStateAction<PostEditorPlacement | null>>;
  setPostTitle: Dispatch<SetStateAction<string>>;
  setPostText: Dispatch<SetStateAction<string>>;
  setPostImages: Dispatch<SetStateAction<string>>;
  refreshSaleAfterMutation: (
    saleId: string,
    channelIds: string[],
  ) => Promise<void>;
}) {
  const { startOperation } = useAppToast();
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
      systemBotConnected={systemBotConnected}
      systemBotUsername={systemBotUsername}
      systemBotWorkspaceId={systemBotWorkspaceId}
      onCreatePayment={async (sale, payload) => {
        await telegramAdSalesApi.createPayment(sale.id, payload);
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
      onDeletePayment={async (sale, paymentId, options) => {
        await telegramAdSalesApi.deletePayment(sale.id, paymentId, options);
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
      onSave={async (sale, draft) => {
        const currentBuyer =
          sale.advertiserTelegramSnapshot ??
          sale.advertiserTelegram ??
          sale.advertiserContact ??
          sale.advertiserNameSnapshot ??
          sale.advertiserName ??
          "";
        const buyerChanged = draft.buyerContact !== currentBuyer;
        const saleChanges = {
          ...(draft.origin !== sale.origin ? { origin: draft.origin } : {}),
          ...(draft.sellerMemberId !==
          (sale.sellerMemberId ?? sale.assignedMemberId)
            ? { sellerMemberId: draft.sellerMemberId }
            : {}),
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
          ...(draft.payments[0]?.currency &&
          draft.payments[0].currency !== sale.settlementCurrency
            ? { settlementCurrency: draft.payments[0].currency }
            : {}),
        };
        const operation = startOperation({
          id: `ad-sale-edit:${sale.id}`,
          title: "Saving deal changes",
          message: "Sending changes to the server…",
          current: 0,
          total: 1,
        });
        try {
          const updatedSale = await telegramAdSalesApi.saveSaleWorkflow(
            sale.id,
            {
              ...(Object.keys(saleChanges).length ? { sale: saleChanges } : {}),
              placements: draft.placements,
              payments: draft.payments,
            },
            (item, current, total) =>
              operation.update({
                message: item.message,
                current,
                total,
                details: `${item.completed.length} completed: ${
                  item.completed.length > 3
                    ? `… ${item.completed.slice(-3).join(" · ")}`
                    : item.completed.join(" · ")
                }. ${
                  item.remaining.length
                    ? `Remaining: ${item.remaining.slice(0, 3).join(" · ")}${item.remaining.length > 3 ? ` · +${item.remaining.length - 3} more` : ""}`
                    : "All steps complete."
                }${item.placementId ? ` · Placement ${item.placementId}` : ""}`,
              }),
          );
          reconcileTelegramAdSaleCache(queryClient, {
            type: "update",
            sale: updatedSale,
          });
          await invalidateTelegramAdSalesDerivedQueries(queryClient, {
            availability: true,
            analytics: true,
            finance: true,
            dashboard: true,
            managedPosts: true,
            channelSummaries: true,
            publicationCalendar: true,
            channelIds: updatedSale.placements.map(
              (placement) => placement.telegramChannelId,
            ),
          });
          operation.succeed({
            title: "Deal changes saved",
            message: "All placement, post, and payment changes are saved.",
          });
        } catch (error) {
          operation.fail({
            title: "Could not save deal changes",
            message:
              error instanceof Error ? error.message : "The save failed.",
          });
          throw error;
        }
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
                mediaItems: draft.mediaItems,
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
              queryKey: telegramPostKeys.managedLists(
                placement.telegramChannelId,
              ),
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
              queryKey: telegramPostKeys.managedLists(
                placement.telegramChannelId,
              ),
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
            await telegramAdSalesApi.cancelPlacement(sale.id, placementId, {});
          } else {
            await telegramAdSalesApi.cancelSale(sale.id);
          }
        } else if (action === "delete-publications") {
          const operation = startOperation({
            id: `delete-sale-publications-${sale.id}`,
            title: "Deleting publications",
            message: "Preparing publication deletion…",
          });
          try {
            const result = await telegramAdSalesApi.cancelSalePublications(
              sale.id,
              (item, current, total) =>
                operation.update({
                  message: item.message,
                  current,
                  total,
                  details: item.state === "FAILED" ? item.message : undefined,
                }),
            );
            if (result.failed) {
              operation.fail({
                message: `${result.deleted} deleted · ${result.failed} failed`,
                details: result.results
                  .filter((item) => !item.success)
                  .map((item) => item.message)
                  .join("\n"),
              });
            } else {
              operation.succeed({
                message: `${result.deleted} publication${
                  result.deleted === 1 ? "" : "s"
                } deleted`,
              });
            }
          } catch (error) {
            operation.fail({
              message:
                error instanceof Error
                  ? error.message
                  : "Could not delete publications",
            });
            throw error;
          }
        } else if (action === "create-post" && placementId) {
          setPostEditorPlacement({ saleId: sale.id, placementId });
          setPostTitle(sale.title || sale.advertiserName);
          setPostText("");
          setPostImages("");
          return;
        } else if (action === "schedule" && placementId) {
          await telegramAdSalesApi.schedulePlacement(sale.id, placementId, {});
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
    />
  );
}
