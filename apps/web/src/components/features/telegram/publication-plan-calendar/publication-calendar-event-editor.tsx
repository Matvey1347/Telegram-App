"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCrossPromotionPlanPayload,
  TelegramPublicationPlanCalendarEvent,
} from "@telegram-system/shared";
import { AdSalesSaleDetailsDialog } from "@/components/features/growth/ad-sales/ad-sales-sale-details-dialog";
import { AdSalesPostLinkDialogs } from "@/components/features/growth/ad-sales/ad-sales-post-link-dialogs";
import { CrossPromotionPlanModal } from "@/components/features/growth/ad-campaigns/cross-promotion-plan-modal";
import {
  accountsApi,
  currenciesApi,
  telegramAdSalesApi,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type Account,
} from "@/lib/api";
import {
  networkKeys,
  telegramChannelKeys,
  telegramPublicationScheduleKeys,
} from "@/lib/query-keys";
import {
  crossPromotionPlanKeys,
  crossPromotionPlansApi,
} from "@/lib/features/growth/cross-promotion-plans-api";
import {
  invalidateTelegramAdSaleReads,
  invalidateTelegramAdSalesDerivedQueries,
  telegramAdSalesKeys,
} from "@/lib/features/growth/telegram-ad-sales-query";

type PostEditorPlacement = { saleId: string; placementId: string };
type PastSlotAssignment = {
  saleId: string;
  placementId: string;
  channelTitle: string;
  slotDateLabel: string;
  posts: Array<{
    id: string;
    title: string;
    kind: "managed" | "telegram";
    status: string;
    dateValue: string;
  }>;
};

/** Opens the full existing editors; the calendar owns only event selection. */
export function PublicationCalendarEventEditor({
  event,
  onClose,
}: {
  event: TelegramPublicationPlanCalendarEvent | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isAd = event?.kind === "AD";
  const isVp = event?.kind === "VP";
  const [postEditorPlacement, setPostEditorPlacement] =
    useState<PostEditorPlacement | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postImages, setPostImages] = useState("");
  const [pastSlotAssignment, setPastSlotAssignment] =
    useState<PastSlotAssignment | null>(null);
  const [selectedPastPostId, setSelectedPastPostId] = useState("");
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
    enabled: Boolean(event),
    staleTime: 60_000,
  });
  const networksQuery = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: isVp,
    staleTime: 60_000,
  });
  const plansQuery = useQuery({
    queryKey: crossPromotionPlanKeys.list("DIRECT_MUTUAL"),
    queryFn: () => crossPromotionPlansApi.list("DIRECT_MUTUAL"),
    enabled: isVp,
    staleTime: 30_000,
  });
  const saleId = isAd ? (event?.adSaleId ?? null) : null;
  const saleQuery = useQuery({
    queryKey: telegramAdSalesKeys.detail(saleId ?? "none"),
    queryFn: () => telegramAdSalesApi.getSale(saleId!),
    enabled: Boolean(saleId),
    retry: false,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
    enabled: isAd,
    staleTime: 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    enabled: isAd,
    staleTime: 5 * 60_000,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    enabled: isAd,
    staleTime: 5 * 60_000,
  });
  const productChannelIds = useMemo(
    () =>
      saleQuery.data
        ? [
            ...new Set(
              saleQuery.data.placements.map((item) => item.telegramChannelId),
            ),
          ]
        : [],
    [saleQuery.data],
  );
  const productsQuery = useQuery({
    queryKey: telegramAdSalesKeys.productsByChannels(productChannelIds),
    queryFn: () => telegramAdSalesApi.listProductsByChannels(productChannelIds),
    enabled: isAd && productChannelIds.length > 0,
    staleTime: 60_000,
  });
  const plan = plansQuery.data?.find(
    (item) => item.id === event?.crossPromotionPlanId,
  );
  const refreshCalendar = () =>
    queryClient.invalidateQueries({
      queryKey: telegramPublicationScheduleKeys.all(),
    });
  const refreshPlan = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: crossPromotionPlanKeys.list("DIRECT_MUTUAL"),
      }),
      queryClient.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      refreshCalendar(),
    ]);
  };
  const savePlanMutation = useMutation({
    mutationFn: (payload: CreateCrossPromotionPlanPayload) => {
      if (!plan) throw new Error("Direct exchange is no longer available.");
      return new Date(plan.scheduledAt).getTime() <= Date.now()
        ? crossPromotionPlansApi.updateCompleted(plan.id, payload)
        : crossPromotionPlansApi.replaceAndSchedule(
            plan.id,
            payload,
            () => undefined,
          );
    },
    onSuccess: async () => {
      await refreshPlan();
      onClose();
    },
  });
  const publishPlanMutation = useMutation({
    mutationFn: (payload: CreateCrossPromotionPlanPayload) => {
      if (!plan) throw new Error("Direct exchange is no longer available.");
      return crossPromotionPlansApi.replaceAndPublishNow(
        plan.id,
        payload,
        () => undefined,
      );
    },
    onSuccess: async () => {
      await refreshPlan();
      onClose();
    },
  });
  const updatePublicationMutation = useMutation({
    mutationFn: ({
      publicationId,
      payload,
    }: {
      publicationId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!plan) throw new Error("Direct exchange is no longer available.");
      return crossPromotionPlansApi.updatePublicationInTelegram(
        plan.id,
        publicationId,
        payload,
      );
    },
    onSuccess: refreshPlan,
  });
  const replacePublicationMutation = useMutation({
    mutationFn: ({
      publicationId,
      payload,
    }: {
      publicationId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!plan) throw new Error("Direct exchange is no longer available.");
      return crossPromotionPlansApi.replacePublicationAndPublishNow(
        plan.id,
        publicationId,
        payload,
        () => undefined,
      );
    },
    onSuccess: refreshPlan,
  });
  const saveDraftMutation = useMutation({
    mutationFn: ({
      draft,
      id,
    }: {
      draft: Record<string, unknown>;
      id?: string;
    }) => crossPromotionPlansApi.saveDraft("DIRECT_MUTUAL", draft, id),
    onSuccess: async () => {
      await refreshPlan();
      onClose();
    },
  });
  const setSelectedSaleId: Dispatch<SetStateAction<string | null>> = (next) => {
    const value = typeof next === "function" ? next(saleId) : next;
    if (!value) onClose();
  };
  const refreshSaleAfterMutation = async (id: string, channelIds: string[]) => {
    await Promise.all([
      invalidateTelegramAdSaleReads(queryClient, { saleId: id, lists: true }),
      invalidateTelegramAdSalesDerivedQueries(queryClient, {
        availability: true,
        analytics: true,
        channelSummaries: true,
        channelIds,
      }),
      refreshCalendar(),
    ]);
  };
  if (isVp)
    return (
      <CrossPromotionPlanModal
        open={Boolean(event)}
        kind="DIRECT_MUTUAL"
        initial={plan ?? null}
        mode="edit"
        channels={channelsQuery.data ?? []}
        networks={networksQuery.data ?? []}
        loading={
          channelsQuery.isLoading ||
          networksQuery.isLoading ||
          plansQuery.isLoading
        }
        saving={
          savePlanMutation.isPending ||
          publishPlanMutation.isPending ||
          updatePublicationMutation.isPending ||
          replacePublicationMutation.isPending ||
          saveDraftMutation.isPending
        }
        onClose={onClose}
        onSubmit={(payload) => savePlanMutation.mutateAsync(payload)}
        onReplaceAndPublishNow={(payload) =>
          publishPlanMutation.mutateAsync(payload)
        }
        onUpdatePublicationInTelegram={(publicationId, payload) =>
          updatePublicationMutation.mutateAsync({ publicationId, payload })
        }
        onReplacePublicationAndPublishNow={(publicationId, payload) =>
          replacePublicationMutation.mutateAsync({ publicationId, payload })
        }
        onSaveDraft={(draft, id) =>
          saveDraftMutation.mutateAsync({ draft, id })
        }
      />
    );
  if (!isAd || !saleId) return null;
  return (
    <>
      <AdSalesSaleDetailsDialog
        selectedSale={saleQuery.data ?? null}
        selectedSaleId={saleId}
        setSelectedSaleId={setSelectedSaleId}
        accounts={accounts as Account[]}
        channels={channelsQuery.data ?? []}
        productsByChannelId={productsQuery.data ?? {}}
        settings={settings}
        rates={rates}
        queryClient={queryClient}
        setPostEditorPlacement={setPostEditorPlacement}
        setPostTitle={setPostTitle}
        setPostText={setPostText}
        setPostImages={setPostImages}
        refreshSaleAfterMutation={refreshSaleAfterMutation}
      />
      <AdSalesPostLinkDialogs
        pastSlotAssignment={pastSlotAssignment}
        setPastSlotAssignment={setPastSlotAssignment}
        selectedPastPostId={selectedPastPostId}
        setSelectedPastPostId={setSelectedPastPostId}
        postEditorPlacement={postEditorPlacement}
        setPostEditorPlacement={setPostEditorPlacement}
        postTitle={postTitle}
        setPostTitle={setPostTitle}
        postText={postText}
        setPostText={setPostText}
        postImages={postImages}
        setPostImages={setPostImages}
        queryClient={queryClient}
      />
    </>
  );
}
