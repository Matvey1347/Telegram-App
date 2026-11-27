"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useOptionalI18n } from "@/providers/i18n-provider";
import type {
  CreateCrossPromotionPlanPayload,
  UpdateCrossPromotionPlanDetails,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
  MutualPromotionFolderListStatus,
} from "@telegram-system/shared";
import { promosApi, telegramChannelNetworksApi, telegramChannelsApi } from "@/lib/api";
import { networkKeys, telegramChannelKeys, telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { crossPromotionPlanKeys, crossPromotionPlansApi } from "@/lib/features/growth/cross-promotion-plans-api";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import { mutualPromotionFolderKeys } from "@/lib/query-keys";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  EmptyState,
  ErrorState,
  ConfirmDeleteModal,
  LoadingState,
  PageHeader,
  Modal,
} from "@/components/ui/primitives";
import { CrossPromotionPlanModal } from "./cross-promotion-plan-modal";
import { CrossPromotionPlanCard } from "./cross-promotion-plan-card";
import { reconcileMutualPromotionFolder } from "./mutual-promotion/mutual-promotion-finance-cache";
import { MutualPromotionFolderCard } from "./mutual-promotion/mutual-promotion-folder-card";
import { PromoFormModal } from "./promo-form-modal";
import { AdsHeaderActions } from "./ads-header-actions";
import { adsSectionHeader } from "./ads-section-header";
import { shouldUpdateHistoricalPromotion } from "./cross-promotion-plan-save-mode";
import { useAppToast } from "@/providers/toast-provider";
import { useSendPublicationConfirmation } from "../use-send-publication-confirmation";
import {
  CrossPromotionPlanStatusTabs,
  plansForCrossPromotionTab,
  type CrossPromotionPlanTab,
} from "./cross-promotion-plan-status-tabs";

import { CrossPromotionKindChoice, PromotionTypeBadge, type PromotionKind } from "./cross-promotion-create-steps";

import type { PromotionFolderFlow } from "./mutual-promotion/mutual-promotion-folder-modals";

import { CrossPromotionDraftChooser } from "./cross-promotion-draft-chooser";

const FolderModals = dynamic(() =>
  import("./mutual-promotion/mutual-promotion-folder-modals").then((module) => module.MutualPromotionFolderModals),
);

export function CrossPromotionPlansPage({
  kind,
  sectionTabs,
}: {
  kind: CrossPromotionPlanKind;
  sectionTabs: ReactNode;
}) {
  const searchParams = useSearchParams();
  const i18n = useOptionalI18n();
  const requestedPlanId = searchParams.get("planId");
  const openedPlanIdRef = useRef<string | null>(null);
  const qc = useQueryClient();
  const refreshCalendar = () =>
    qc.invalidateQueries({
      queryKey: telegramPublicationScheduleKeys.calendarRoot(),
    });
  const { startOperation } = useAppToast();
  const [folderFlow, setFolderFlow] = useState<PromotionFolderFlow | null>(() => {
    const folderId = searchParams.get("folderId");
    if (folderId) return { kind: "detail", folderId };
    return searchParams.get("mode") === "folders" && searchParams.get("create") === "1"
      ? { kind: "create" }
      : null;
  });
  const [choosingKind, setChoosingKind] = useState(false);
  const [selectedCreationKind, setSelectedCreationKind] = useState<PromotionKind>("DIRECT_MUTUAL");
  const [initialDraftId, setInitialDraftId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [modalKind, setModalKind] = useState(kind);
  const [editingPlan, setEditingPlan] = useState<CrossPromotionPlan | null>(null);
  const returnToKindChoice = () => {
    setOpen(false);
    setFolderFlow(null);
    setChoosingKind(true);
  };
  const openCreation = (draftId: string | null) => {
    setChoosingKind(false);
    if (selectedCreationKind === "FOLDER") {
      setFolderFlow({ kind: "create", initialDraftId: draftId });
      return;
    }
    setInitialDraftId(draftId);
    setModalKind(selectedCreationKind);
    setOpen(true);
  };
  const [deletePlan, setDeletePlan] = useState<CrossPromotionPlan | null>(null);
  const [previewPromoId, setPreviewPromoId] = useState<string | null>(null);
  const [planTab, setPlanTab] = useState<CrossPromotionPlanTab>("ACTIVE");
  const plansQuery = useQuery({
    queryKey: crossPromotionPlanKeys.combined,
    queryFn: crossPromotionPlansApi.listAll,
  });
  const folderStatus: MutualPromotionFolderListStatus = planTab === "DRAFT" ? "ACTIVE" : planTab;
  const folderListParams = { page: 1, pageSize: 100, status: folderStatus };
  const foldersQuery = useQuery({
    queryKey: mutualPromotionFolderKeys.list(folderListParams),
    queryFn: () => mutualPromotionFoldersApi.list(folderListParams),
    enabled: planTab !== "DRAFT",
  });
  useEffect(() => {
    if (!requestedPlanId || openedPlanIdRef.current === requestedPlanId) return;
    const plan = plansQuery.data?.find((item) => item.id === requestedPlanId);
    if (!plan) return;
    openedPlanIdRef.current = requestedPlanId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEditingPlan(plan);
      setModalKind(plan.kind);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [plansQuery.data, requestedPlanId]);
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
    enabled: open || Boolean(previewPromoId),
  });
  const networksQuery = useQuery({
    queryKey: networkKeys.options(),
    queryFn: telegramChannelNetworksApi.listOptions,
    enabled: open,
    staleTime: 24 * 60 * 60_000,
  });
  const previewPromoQuery = useQuery({
    queryKey: ["promos", "preview", previewPromoId],
    queryFn: () => promosApi.get(previewPromoId!),
    enabled: Boolean(previewPromoId),
  });
  const saveMutation = useMutation({
    mutationFn: async (payload: CreateCrossPromotionPlanPayload) => {
      if (editingPlan && shouldUpdateHistoricalPromotion(editingPlan)) {
        return crossPromotionPlansApi.updateCompleted(editingPlan.id, payload);
      }
      const operation = startOperation({
        id: `cross-promotion-schedule-${Date.now()}`,
        title: "Scheduling mutual promotion",
        message: "Validating promotion placement…",
        current: 0,
        total: payload.publisherChannelIds.length + 2,
      });
      try {
        const onProgress = (
          progress: { message: string },
          current: number,
          total: number,
        ) => operation.update({ message: progress.message, current, total });
        const plan = editingPlan
          ? await crossPromotionPlansApi.replaceAndSchedule(
              editingPlan.id,
              payload,
              onProgress,
            )
          : await crossPromotionPlansApi.createAndSchedule(payload, onProgress);
        operation.succeed({
          message: `${payload.publisherChannelIds.length} Telegram post(s) scheduled.`,
        });
        return plan;
      } catch (error) {
        operation.fail({
          message:
            error instanceof Error
              ? error.message
              : "The promotion could not be scheduled.",
        });
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        refreshCalendar(),
        qc.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttributions(),
        }),
      ]);
      setOpen(false);
      setEditingPlan(null);
    },
    // A stream can disconnect after the server has already persisted a
    // partial plan. Refresh it so the user can continue that exact plan
    // instead of submitting the browser draft as a duplicate.
    onError: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
      ]);
    },
  });
  const saveDraftMutation = useMutation({
    mutationFn: ({
      draft,
      id,
    }: {
      draft: Record<string, unknown>;
      id?: string;
    }) => crossPromotionPlansApi.saveDraft(modalKind, draft, id),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: crossPromotionPlanKeys.combined,
      });
      setOpen(false);
      setEditingPlan(null);
    },
  });
  const updateDetailsMutation = useMutation({
    mutationFn: (details: UpdateCrossPromotionPlanDetails) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.updateDetails(editingPlan.id, details);
    },
    onSuccess: (plan) => {
      qc.setQueryData<CrossPromotionPlan[]>(
        crossPromotionPlanKeys.combined,
        (current) =>
          current?.map((item) => (item.id === plan.id ? plan : item)) ?? [],
      );
      setEditingPlan(plan);
      setOpen(false);
      void refreshCalendar();
    },
  });
  const replaceAndPublishNowMutation = useMutation({
    mutationFn: async (payload: CreateCrossPromotionPlanPayload) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      const operation = startOperation({
        id: `cross-promotion-publish-now-${editingPlan.id}`,
        title: "Replacing published mutual promotion",
        message: "Removing old Telegram posts…",
        current: 0,
        total: payload.publisherChannelIds.length + 2,
      });
      try {
        const plan = await crossPromotionPlansApi.replaceAndPublishNow(
          editingPlan.id,
          payload,
          (progress, current, total) =>
            operation.update({ message: progress.message, current, total }),
        );
        operation.succeed({
          message: `${payload.publisherChannelIds.length} replacement post(s) published.`,
        });
        return plan;
      } catch (error) {
        operation.fail({
          message:
            error instanceof Error
              ? error.message
              : "Could not replace published posts.",
        });
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        refreshCalendar(),
      ]);
      setOpen(false);
      setEditingPlan(null);
    },
  });
  const updatePublicationMutation = useMutation({
    mutationFn: async ({
      publicationId,
      payload,
    }: {
      publicationId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      const operation = startOperation({
        id: `cross-promotion-update-${editingPlan.id}-${publicationId}`,
        title: "Updating partner post",
        message: "Validating post update…",
        current: 0,
        total: payload.publisherChannelIds.length + 2,
      });
      try {
        const plan = await crossPromotionPlansApi.updatePublicationInTelegram(
          editingPlan.id,
          publicationId,
          payload,
          (progress, current, total) =>
            operation.update({
              message: progress.message,
              current,
              total,
            }),
        );
        operation.succeed({ message: "Partner post updated in all channels." });
        return plan;
      } catch (error) {
        operation.fail({
          message:
            error instanceof Error
              ? error.message
              : "Could not update the partner post.",
        });
        throw error;
      }
    },
    onSuccess: async (plan) => {
      // Keep the open editor aligned with the authoritative content returned
      // by the all-channel update. Otherwise the same local diff remains
      // visible and invites a duplicate update click.
      setEditingPlan(plan);
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        refreshCalendar(),
      ]);
    },
  });
  const replacePublicationMutation = useMutation({
    mutationFn: async ({
      publicationId,
      payload,
    }: {
      publicationId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.replacePublicationAndPublishNow(
        editingPlan.id,
        publicationId,
        payload,
        () => undefined,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        refreshCalendar(),
      ]);
    },
  });
  const updatePublicationChannelMutation = useMutation({
    mutationFn: ({
      publicationId,
      channelId,
      payload,
    }: {
      publicationId: string;
      channelId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.updatePublicationChannelSchedule(
        editingPlan.id,
        publicationId,
        channelId,
        payload,
      );
    },
    onSuccess: async (plan) => {
      setEditingPlan(plan);
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        refreshCalendar(),
      ]);
    },
  });
  const replacePublicationChannelMutation = useMutation({
    mutationFn: ({
      publicationId,
      channelId,
      payload,
    }: {
      publicationId: string;
      channelId: string;
      payload: CreateCrossPromotionPlanPayload;
    }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.replacePublicationChannelSchedule(
        editingPlan.id,
        publicationId,
        channelId,
        payload,
      );
    },
    onSuccess: async (plan) => {
      setEditingPlan(plan);
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        refreshCalendar(),
      ]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => crossPromotionPlansApi.remove(id),
    onSuccess: ({ id }) => {
      qc.setQueryData<CrossPromotionPlan[]>(
        crossPromotionPlanKeys.combined,
        (current) => current?.filter((plan) => plan.id !== id) ?? [],
      );
      void Promise.all([
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        refreshCalendar(),
        qc.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttributions(),
        }),
      ]);
    },
  });
  const resumeMutation = useMutation({
    mutationFn: async (plan: CrossPromotionPlan) => {
      const operation = startOperation({
        id: `cross-promotion-resume-${plan.id}`,
        title: "Continuing mutual promotion",
        message: "Checking saved publication progress…",
        current: 0,
        total: plan.publisherChannelIds.length + 2,
      });
      try {
        const resumed = await crossPromotionPlansApi.resume(
          plan.id,
          (progress, current, total) =>
            operation.update({ message: progress.message, current, total }),
        );
        operation.succeed({ message: "Promotion scheduling completed." });
        return resumed;
      } catch (error) {
        operation.fail({
          message:
            error instanceof Error
              ? error.message
              : "Could not continue the promotion.",
        });
        throw error;
      }
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: crossPromotionPlanKeys.combined,
        }),
        refreshCalendar(),
      ]);
    },
  });
  const sendToBotMutation = useSendPublicationConfirmation(crossPromotionPlansApi.sendToBot);
  const refreshFolderLinks = useMutation({
    mutationFn: (id: string) => mutualPromotionFoldersApi.refreshInviteLinkData(id),
    onSuccess: (folder) => reconcileMutualPromotionFolder(qc, folder),
  });
  const refreshInviteLinksMutation = useMutation({
    mutationFn: (id: string) =>
      crossPromotionPlansApi.refreshInviteLinkData(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() }),
        qc.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttributions(),
        }),
      ]);
    },
  });
  const header = adsSectionHeader("mutual-promotion");
  // A promotion is its own scheduling and tracking record. Do not collapse
  // records that happen to share an advertiser or partner channels: doing so
  // hides real placements behind an "Integrations" list.
  const plans = plansQuery.data ?? [];
  const visiblePlans = plansForCrossPromotionTab(plans, planTab);
  const visibleFolders = planTab === "DRAFT" ? [] : (foldersQuery.data?.items ?? []);
  return (
    <AppShell>
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        action={
          <AdsHeaderActions>
            <Button
              onClick={() => {
                setEditingPlan(null);
                setSelectedCreationKind("DIRECT_MUTUAL");
                setChoosingKind(true);
              }}
            >
              <Plus size={16} /> {header.actionLabel}
            </Button>
          </AdsHeaderActions>
        }
      />
      {sectionTabs}
      <CrossPromotionPlanStatusTabs
        plans={plans}
        folderCounts={foldersQuery.data?.statusCounts}
        value={planTab}
        onChange={setPlanTab}
        ariaLabel="Promotion status"
      />
      <div className="mt-4">
        {refreshFolderLinks.isError ? <ErrorState text="Could not refresh the folder invite links." /> : null}
        {plansQuery.isError ? <ErrorState text="Could not load promotion placements." /> : null}
        {planTab !== "DRAFT" && foldersQuery.isError ? (
          <ErrorState text="Could not load promotion folders." />
        ) : null}
        {plansQuery.isLoading || (planTab !== "DRAFT" && foldersQuery.isLoading) ? (
          <LoadingState />
        ) : !visiblePlans.length && !visibleFolders.length ? (
          !plansQuery.isError && (planTab === "DRAFT" || !foldersQuery.isError) ? (
            <EmptyState
              text={planTab === "ACTIVE"
                ? i18n?.t("ads.no_active_promotions") ?? "No active promotions."
                : `No ${planTab.toLowerCase()} promotions.`}
            />
          ) : null
        ) : (
          <div className="columns-1 gap-3 xl:columns-2">
            {visibleFolders.map((folder) => (
              <div key={`folder:${folder.id}`} className="mb-3 break-inside-avoid">
                <MutualPromotionFolderCard
                  folder={folder}
                  typeBadge={<PromotionTypeBadge kind="FOLDER" />}
                  onOpen={() => setFolderFlow({ kind: "detail", folderId: folder.id, title: folder.title })}
                  onDelete={() => setFolderFlow({ kind: "delete", folderId: folder.id, title: folder.title })}
                  onRefreshInviteLinks={() => refreshFolderLinks.mutate(folder.id)}
                  refreshingInviteLinks={
                    refreshFolderLinks.isPending && refreshFolderLinks.variables === folder.id
                  }
                />
              </div>
            ))}
            {visiblePlans.map((plan) => (
              <div key={plan.id} className="mb-3 break-inside-avoid">
                <CrossPromotionPlanCard
                  plan={plan}
                  onEdit={(source) => {
                    setEditingPlan(source);
                    setModalKind(source.kind);
                    setOpen(true);
                  }}
                  onDelete={() => setDeletePlan(plan)}
                  onResume={(source) => resumeMutation.mutate(source)}
                  onSendToBot={(source) => sendToBotMutation.mutate(source.id)}
                  sendingToBot={sendToBotMutation.isPending}
                  onOpenPromo={setPreviewPromoId}
                  onRefreshInviteLinks={(source) => refreshInviteLinksMutation.mutate(source.id)}
                  refreshingInviteLinks={
                    refreshInviteLinksMutation.isPending && refreshInviteLinksMutation.variables === plan.id
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={choosingKind}
        title={i18n?.t("ads.promotion_type") ?? "Promotion type"}
        onClose={() => setChoosingKind(false)}
      >
        <div className="space-y-4">
          <CrossPromotionKindChoice kind={selectedCreationKind} onSelect={setSelectedCreationKind} />
          <CrossPromotionDraftChooser kind={selectedCreationKind} onOpen={openCreation} />
        </div>
      </Modal>
      {folderFlow ? (
        <FolderModals
          key={folderFlow.kind === "create" ? "create" : `${folderFlow.kind}:${folderFlow.folderId}`}
          flow={folderFlow}
          onClose={() => setFolderFlow(null)}
          onBack={folderFlow.kind === "create" ? returnToKindChoice : undefined}
        />
      ) : null}
      <CrossPromotionPlanModal
        open={open && !folderFlow}
        kind={modalKind}
        onBack={!editingPlan ? returnToKindChoice : undefined}
        initial={editingPlan}
        initialDraftId={editingPlan ? undefined : initialDraftId}
        mode={editingPlan ? "edit" : "create"}
        channels={channelsQuery.data ?? []}
        networks={networksQuery.data ?? []}
        loading={channelsQuery.isLoading || networksQuery.isLoading}
        saving={
          saveMutation.isPending ||
          updateDetailsMutation.isPending ||
          replaceAndPublishNowMutation.isPending ||
          updatePublicationMutation.isPending ||
          replacePublicationMutation.isPending ||
          updatePublicationChannelMutation.isPending ||
          replacePublicationChannelMutation.isPending
        }
        onClose={() => {
          setOpen(false);
          setEditingPlan(null);
        }}
        onSubmit={(payload) => saveMutation.mutateAsync(payload)}
        onReplaceAndPublishNow={(payload) => replaceAndPublishNowMutation.mutateAsync(payload)}
        onUpdatePublicationInTelegram={(publicationId, payload) =>
          updatePublicationMutation.mutateAsync({ publicationId, payload })
        }
        onReplacePublicationAndPublishNow={(publicationId, payload) =>
          replacePublicationMutation.mutateAsync({ publicationId, payload })
        }
        onUpdatePublicationChannelSchedule={(publicationId, channelId, payload) =>
          updatePublicationChannelMutation.mutateAsync({
            publicationId,
            channelId,
            payload,
          })
        }
        onReplacePublicationChannelSchedule={(publicationId, channelId, payload) =>
          replacePublicationChannelMutation.mutateAsync({
            publicationId,
            channelId,
            payload,
          })
        }
        onSaveDraft={(draft, id) => saveDraftMutation.mutateAsync({ draft, id })}
        onApplyPublicationEdits={async (ids, payload) => {
          if (!editingPlan) throw new Error("Promotion is not available");
          try {
            for (const publicationId of ids) {
              await crossPromotionPlansApi.updatePublicationInTelegram(editingPlan.id, publicationId, payload, () => undefined);
            }
            await updateDetailsMutation.mutateAsync({
              title: payload.title,
              ...(payload.publicationPost.iconId !== editingPlan.publicationPost.iconId ? { iconId: payload.publicationPost.iconId } : {}),
              advertiserId: payload.advertiserId,
              partnerTelegramUsername: payload.partnerTelegramUsername,
              ...(payload.kind === "DIRECT_MUTUAL" && JSON.stringify(editingPlan.targets) !== JSON.stringify(payload.targets)
                ? { targets: payload.targets } : {}),
            });
          } finally {
            await Promise.all([qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.combined }), refreshCalendar()]);
          }
        }}
        onUpdateDetails={(details) => updateDetailsMutation.mutateAsync(details)}
      />
      <PromoFormModal
        open={Boolean(previewPromoQuery.data)}
        title="Edit Promo"
        initial={previewPromoQuery.data}
        channels={channelsQuery.data ?? []}
        onClose={() => setPreviewPromoId(null)}
        onSubmit={async (payload) => {
          const promo = previewPromoQuery.data;
          if (!promo) return;
          await promosApi.update(promo.id, payload);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["promos"] }),
            qc.invalidateQueries({
              queryKey: crossPromotionPlanKeys.combined,
            }),
          ]);
          setPreviewPromoId(null);
        }}
      />
      <ConfirmDeleteModal
        open={Boolean(deletePlan)}
        onClose={() => setDeletePlan(null)}
        entityName={deletePlan?.title ?? "mutual promotion"}
        description="Linked scheduled or published Telegram posts will be removed before this promotion is deleted."
        onConfirm={async () => {
          if (!deletePlan) return;
          await deleteMutation.mutateAsync(deletePlan.id);
          setDeletePlan(null);
        }}
      />
    </AppShell>
  );
}
