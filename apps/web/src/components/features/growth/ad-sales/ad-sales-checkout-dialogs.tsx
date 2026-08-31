"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import type {
  Account,
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import { telegramAdSalesApi, telegramSystemBotApi } from "@/lib/api";
import {
  getTelegramChannelPosts,
  syncTelegramChannelPostMetrics,
} from "@/lib/api";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { AdSaleModal } from "./ad-sale-modal";
import { RegisterPaymentModal } from "./register-payment-modal";

export function AdSalesCheckoutDialogs({
  adSaleModalOpen,
  setAdSaleModalOpen,
  accounts,
  channels,
  networks,
  productsByChannelId,
  settings,
  workspaceTimezone,
  adSaleSeedSlot,
  systemBotConnected,
  systemBotUsername,
  submitAdSale,
  paymentSale,
  setPaymentSale,
  refreshSaleAfterMutation,
}: {
  adSaleModalOpen: boolean;
  setAdSaleModalOpen: Dispatch<SetStateAction<boolean>>;
  accounts: Account[];
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  settings: ComponentProps<typeof AdSaleModal>["defaultCurrency"] extends string
    ? { primaryCurrency?: string | null } | undefined
    : never;
  workspaceTimezone: string;
  adSaleSeedSlot: TelegramAdAvailabilitySlot | null;
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  submitAdSale: ComponentProps<typeof AdSaleModal>["onSubmit"];
  paymentSale: TelegramAdSale | null;
  setPaymentSale: Dispatch<SetStateAction<TelegramAdSale | null>>;
  refreshSaleAfterMutation: (
    saleId: string,
    channelIds: string[],
  ) => Promise<void>;
}) {
  return (
    <>
      <AdSaleModal
        open={adSaleModalOpen}
        onClose={() => setAdSaleModalOpen(false)}
        accounts={accounts as Account[]}
        channels={channels}
        networks={networks}
        productsByChannelId={productsByChannelId}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        workspaceTimezone={workspaceTimezone}
        initialChannelId={adSaleSeedSlot?.channelId ?? null}
        initialScheduledAt={adSaleSeedSlot?.scheduledAt ?? null}
        initialInventoryOpportunityKey={
          adSaleSeedSlot?.inventoryOpportunityKey ?? null
        }
        systemBotConnected={systemBotConnected}
        systemBotUsername={systemBotUsername}
        onPrepareSystemBot={async () => {
          const prepared = await telegramSystemBotApi.prepareAdSalePostImport();
          return prepared.workflowId;
        }}
        onSendSystemBotPost={async (draft) => {
          await telegramSystemBotApi.sendAdSalePostPreview({
            title: draft.title,
            text: draft.text,
            imageUrls: draft.imageUrls,
            buttonRows: draft.buttonRows,
          });
        }}
        onSystemBotReturn={async (workflowId) => {
          const result =
            await telegramSystemBotApi.adSalePostImportResult(workflowId);
          if (!result.ready) return null;
          return result.draft;
        }}
        onSearchAdvertisers={(query) =>
          telegramAdSalesApi.searchAdvertisers({ q: query, limit: 20 })
        }
        onRequestQuotePreview={(requests, signal) =>
          telegramAdSalesApi.previewQuotes({ requests }, signal)
        }
        onLoadAvailableSlots={async ({ channelId, productId, from, to }) => {
          const result = await telegramAdSalesApi.availability({
            from,
            to,
            channelIds: [channelId],
            ...(productId ? { productIds: [productId] } : {}),
          });
          return result.slots.filter(
            (slot) => slot.state === "AVAILABLE" || slot.state === "PAST",
          );
        }}
        onLoadPublishedPosts={async ({
          channelId,
          date,
          timezone,
          telegramPostUrl,
        }) => {
          const from = zonedDateTimeToUtc(
            date,
            "00:00:00",
            timezone,
          ).toISOString();
          const to = zonedDateTimeToUtc(
            date,
            "23:59:59",
            timezone,
          ).toISOString();
          const telegramMessageId =
            telegramPostUrl?.match(/\/(\d+)(?:[/?#].*)?$/)?.[1];
          const params = {
            page: 1,
            pageSize: 100,
            ...(telegramMessageId
              ? { search: telegramMessageId }
              : { from, to }),
          };
          let result = await getTelegramChannelPosts(channelId, params, true);
          const hasRequestedPost = () =>
            telegramMessageId
              ? result.items.some(
                  (post) =>
                    String(post.telegramMessageId) === telegramMessageId,
                )
              : result.items.length > 0;
          if (!hasRequestedPost()) {
            try {
              await syncTelegramChannelPostMetrics(
                channelId,
                {
                  postLimit: 100,
                },
                true,
              );
              result = await getTelegramChannelPosts(channelId, params, true);
            } catch {
              // Keep the locally stored history available if live Telegram
              // synchronization is unavailable for this connected account.
            }
          }
          const items = telegramMessageId
            ? result.items.filter(
                (post) => String(post.telegramMessageId) === telegramMessageId,
              )
            : result.items;
          return items.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              "Telegram post",
            publishedAt: post.postDate,
          }));
        }}
        onSubmit={submitAdSale}
      />

      {paymentSale ? (
        <RegisterPaymentModal
          key={paymentSale.id}
          open
          onClose={() => setPaymentSale(null)}
          sale={paymentSale}
          accounts={accounts as Account[]}
          defaultCurrency={settings?.primaryCurrency || "USD"}
          onSubmit={async (payload) => {
            await telegramAdSalesApi.createPayment(paymentSale.id, payload);
            await refreshSaleAfterMutation(
              paymentSale.id,
              paymentSale.placements.map(
                (placement) => placement.telegramChannelId,
              ),
            );
            setPaymentSale(null);
          }}
        />
      ) : null}
    </>
  );
}
