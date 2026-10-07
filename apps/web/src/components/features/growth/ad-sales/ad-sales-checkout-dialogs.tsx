"use client";

import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdProduct,
} from "@telegram-system/shared";
import type {
  Account,
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import { telegramAdSalesApi } from "@/lib/api";
import {
  getTelegramChannelPosts,
  syncTelegramChannelPostMetrics,
} from "@/lib/api";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { AdSaleModal } from "./ad-sale-modal";
import type { AdSaleModalDraft } from "./ad-sale-modal-draft";

export function telegramMessageIdFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "t.me") return undefined;
    const messageId = url.pathname.split("/").filter(Boolean).at(-1);
    return messageId && /^\d+$/.test(messageId) ? messageId : undefined;
  } catch {
    return undefined;
  }
}

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
  systemBotWorkspaceId,
  submitAdSale,
  initialAdvertiser,
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
  systemBotWorkspaceId?: string | null;
  submitAdSale: ComponentProps<typeof AdSaleModal>["onSubmit"];
  initialAdvertiser?: ComponentProps<typeof AdSaleModal>["initialAdvertiser"];
}) {
  const draftsQuery = useQuery({
    queryKey: telegramAdSalesKeys.drafts(),
    queryFn: telegramAdSalesApi.listDrafts,
    enabled: adSaleModalOpen,
    staleTime: 0,
  });
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
        initialAdvertiser={initialAdvertiser}
        systemBotConnected={systemBotConnected}
        systemBotUsername={systemBotUsername}
        systemBotWorkspaceId={systemBotWorkspaceId}
        savedDrafts={draftsQuery.data ?? []}
        onSaveDraft={async (draft: AdSaleModalDraft, existingDraftId) => {
          const title = draft.advertiserContact.trim() || "Unfinished ad sale";
          const saved = existingDraftId
            ? await telegramAdSalesApi.updateDraft(existingDraftId, {
                title,
                payload: draft,
              })
            : await telegramAdSalesApi.createDraft({ title, payload: draft });
          await draftsQuery.refetch();
          return saved.id;
        }}
        onDeleteSavedDraft={async (draftId) => {
          await telegramAdSalesApi.deleteDraft(draftId);
          await draftsQuery.refetch();
        }}
        onSearchAdvertisers={(query) =>
          telegramAdSalesApi.searchAdvertisers({ q: query, limit: 20 })
        }
        onRequestQuotePreview={(requests, signal) =>
          telegramAdSalesApi.previewQuotes({ requests }, signal)
        }
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
          const telegramMessageId = telegramMessageIdFromUrl(telegramPostUrl);
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
          if (!hasRequestedPost() && telegramMessageId) {
            try {
              await syncTelegramChannelPostMetrics(
                channelId,
                {
                  messageIds: [telegramMessageId],
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
            telegramPostUrl: post.primaryTelegramMessageUrl ?? telegramPostUrl ?? null,
            viewsCount: post.viewsCount ?? null,
            reactionsCount: post.reactionsCount ?? null,
          }));
        }}
        onSubmit={submitAdSale}
      />
    </>
  );
}
