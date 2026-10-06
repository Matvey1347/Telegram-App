"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountsApi,
  authApi,
  telegramAdSalesApi,
  telegramChannelNetworksApi,
  telegramSystemBotApi,
} from "@/lib/api";
import { accountKeys, authKeys, networkKeys, telegramSystemBotKeys } from "@/lib/query-keys";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useAppToast } from "@/providers/toast-provider";
import { AdSalesCheckoutDialogs } from "../ad-sales-checkout-dialogs";
import { useAdSalesChannels } from "../use-ad-sales-channels";
import type { AdSaleModal } from "../ad-sale-modal";

type SubmitPayload = Parameters<ComponentProps<typeof AdSaleModal>["onSubmit"]>[0];

export function CrmAdSaleLauncher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { startOperation } = useAppToast();
  const idempotencyKey = useRef<string | null>(null);
  const { channels } = useAdSalesChannels(open);
  const accountsQuery = useQuery({
    queryKey: accountKeys.accounts(),
    queryFn: accountsApi.list,
    enabled: open,
    staleTime: 60_000,
  });
  const networksQuery = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: open,
    staleTime: 60_000,
  });
  const meQuery = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const systemBotQuery = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    enabled: open,
    staleTime: 60_000,
  });
  const checkout = useMutation({
    mutationFn: async (payload: SubmitPayload) => {
      const key = idempotencyKey.current ?? crypto.randomUUID();
      idempotencyKey.current = key;
      const operation = startOperation({
        id: `crm-ad-sale-create:${Date.now()}`,
        title: "Creating ad sale",
        message: "Saving the sale and reserving its placements…",
        current: 0,
        total: 1 + payload.placements.filter((item) => item.managedPostDraft).length * 2,
      });
      try {
        const result = await telegramAdSalesApi.checkoutSaleWorkflow(
          {
            advertiserId: payload.advertiserId,
            createAdvertiser: payload.createAdvertiser,
            advertiserName: payload.advertiserName,
            advertiserTelegram: payload.advertiserTelegram,
            advertiserContact: payload.advertiserContact,
            origin: payload.origin,
            settlementCurrency: payload.paymentCurrency,
            assignedMemberId: payload.assignedMemberId,
            financeSkipped: payload.financeSkipped,
            idempotencyKey: payload.financeSkipped ? key : undefined,
            priceAllocation: payload.priceAllocation,
            placements: payload.placements.map((placement) => ({
              telegramChannelId: placement.channelId,
              telegramAdProductId: placement.productId,
              inventoryOpportunityKey: placement.inventoryOpportunityKey,
              scheduledAt: placement.scheduledAt,
              timezone: placement.timezone,
              agreedPrice: placement.agreedPrice,
              recommendedPrice: placement.recommendedPrice,
              minimumPrice: placement.minimumPrice,
              expectedViews: placement.expectedViews,
              pricingMode: placement.pricingMode,
              currency: payload.paymentCurrency,
              manualPriceReason: placement.manualPriceReason,
              telegramPostId: placement.telegramPostId,
              managedPostDraft: placement.managedPostDraft,
            })),
            payment: payload.financeSkipped
              ? undefined
              : {
                  accountId: payload.accountId!,
                  amount: payload.paymentAmount!,
                  currency: payload.paymentCurrency,
                  paidAt: new Date().toISOString(),
                  idempotencyKey: key,
                },
          },
          (item, current, total) => operation.update({ message: item.message, current, total }),
        );
        if (result.failures.length) throw new Error(result.failures[0]?.message);
        idempotencyKey.current = null;
        operation.succeed({ message: "Ad sale created." });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: telegramCrmKeys.contactLists() }),
          queryClient.invalidateQueries({ queryKey: telegramCrmKeys.analytics() }),
          queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.listRoot() }),
        ]);
        return result;
      } catch (error) {
        operation.fail({
          message: error instanceof Error ? error.message : "Could not create the ad sale.",
        });
        throw error;
      }
    },
  });

  return (
    <AdSalesCheckoutDialogs
      adSaleModalOpen={open}
      setAdSaleModalOpen={(next) => {
        if (typeof next === "function" ? next(open) : next) return;
        onClose();
      }}
      accounts={accountsQuery.data ?? []}
      channels={channels}
      networks={networksQuery.data ?? []}
      productsByChannelId={{}}
      settings={{ primaryCurrency: meQuery.data?.workspace.primaryCurrency }}
      workspaceTimezone={meQuery.data?.workspace.timezone || "Europe/Warsaw"}
      adSaleSeedSlot={null}
      systemBotConnected={systemBotQuery.data?.connected}
      systemBotUsername={systemBotQuery.data?.username}
      systemBotWorkspaceId={systemBotQuery.data?.currentWorkspaceId}
      submitAdSale={(payload) => checkout.mutateAsync(payload)}
    />
  );
}
