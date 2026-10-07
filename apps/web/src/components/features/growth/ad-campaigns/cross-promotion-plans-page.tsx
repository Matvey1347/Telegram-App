"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  CreateCrossPromotionPlanPayload,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
} from "@telegram-system/shared";
import {
  promosApi,
  telegramChannelNetworksApi,
  telegramChannelsApi,
} from "@/lib/api";
import { networkKeys, telegramChannelKeys } from "@/lib/query-keys";
import {
  crossPromotionPlanKeys,
  crossPromotionPlansApi,
} from "@/lib/features/growth/cross-promotion-plans-api";
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
import { PromoFormModal } from "./promo-form-modal";
import { adsSectionHeader } from "./ads-section-header";
import { useAppToast } from "@/providers/toast-provider";
import {
  CrossPromotionPlanStatusTabs,
  plansForCrossPromotionTab,
  type CrossPromotionPlanTab,
} from "./cross-promotion-plan-status-tabs";

export function CrossPromotionPlansPage({
  kind,
  sectionTabs,
  mutualModeTabs,
}: {
  kind: CrossPromotionPlanKind;
  sectionTabs: ReactNode;
  mutualModeTabs?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const requestedPlanId = searchParams.get("planId");
  const openedPlanIdRef = useRef<string | null>(null);
  const qc = useQueryClient();
  const { startOperation } = useAppToast();
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CrossPromotionPlan | null>(
    null,
  );
  const [deletePlan, setDeletePlan] = useState<CrossPromotionPlan | null>(null);
  const [previewPromoId, setPreviewPromoId] = useState<string | null>(null);
  const [botNotificationPlan, setBotNotificationPlan] =
    useState<CrossPromotionPlan | null>(null);
  const [planTab, setPlanTab] = useState<CrossPromotionPlanTab>("ACTIVE");
  const plansQuery = useQuery({
    queryKey: crossPromotionPlanKeys.list(kind),
    queryFn: () => crossPromotionPlansApi.list(kind),
  });
  useEffect(() => {
    if (!requestedPlanId || openedPlanIdRef.current === requestedPlanId) return;
    const plan = plansQuery.data?.find((item) => item.id === requestedPlanId);
    if (!plan) return;
    openedPlanIdRef.current = requestedPlanId;
    setEditingPlan(plan);
    setOpen(true);
  }, [plansQuery.data, requestedPlanId]);
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
    staleTime: 60_000,
  });
  const networksQuery = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    staleTime: 60_000,
  });
  const previewPromoQuery = useQuery({
    queryKey: ["promos", "preview", previewPromoId],
    queryFn: () => promosApi.get(previewPromoId!),
    enabled: Boolean(previewPromoId),
  });
  const botNotificationPreviewQuery = useQuery({
    queryKey: ["cross-promotion-plans", "bot-notification-preview", botNotificationPlan?.id],
    queryFn: () => crossPromotionPlansApi.previewBotNotification(botNotificationPlan!.id),
    enabled: Boolean(botNotificationPlan),
  });
  const saveMutation = useMutation({
    mutationFn: async (payload: CreateCrossPromotionPlanPayload) => {
      const isHistorical =
        editingPlan &&
        new Date(editingPlan.scheduledAt).getTime() <= Date.now();
      if (editingPlan && isHistorical) {
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
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
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
      await qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) });
    },
  });
  const saveDraftMutation = useMutation({
    mutationFn: ({
      draft,
      id,
    }: {
      draft: Record<string, unknown>;
      id?: string;
    }) => crossPromotionPlansApi.saveDraft(kind, draft, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) });
      setOpen(false);
      setEditingPlan(null);
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
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      ]);
      setOpen(false);
      setEditingPlan(null);
    },
  });
  const updatePublicationMutation = useMutation({
    mutationFn: ({ publicationId, payload }: { publicationId: string; payload: CreateCrossPromotionPlanPayload }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.updatePublicationInTelegram(editingPlan.id, publicationId, payload);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      ]);
    },
  });
  const replacePublicationMutation = useMutation({
    mutationFn: async ({ publicationId, payload }: { publicationId: string; payload: CreateCrossPromotionPlanPayload }) => {
      if (!editingPlan) throw new Error("Promotion is not available");
      return crossPromotionPlansApi.replacePublicationAndPublishNow(
        editingPlan.id, publicationId, payload, () => undefined,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      ]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => crossPromotionPlansApi.remove(id),
    onSuccess: ({ id }) => {
      qc.setQueryData<CrossPromotionPlan[]>(
        crossPromotionPlanKeys.list(kind),
        (current) => current?.filter((plan) => plan.id !== id) ?? [],
      );
      void Promise.all([
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
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
      await qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) });
    },
  });
  const sendToBotMutation = useMutation({
    mutationFn: (plan: CrossPromotionPlan) => crossPromotionPlansApi.sendToBot(plan.id),
  });
  const refreshInviteLinksMutation = useMutation({
    mutationFn: (id: string) => crossPromotionPlansApi.refreshInviteLinkData(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) }),
        qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
        qc.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttributions(),
        }),
      ]);
    },
  });
  const header = adsSectionHeader(
    kind === "DIRECT_MUTUAL" ? "mutual-promotion" : "own-promotion",
  );
  // A promotion is its own scheduling and tracking record. Do not collapse
  // records that happen to share an advertiser or partner channels: doing so
  // hides real placements behind an "Integrations" list.
  const plans = plansQuery.data ?? [];
  const visiblePlans = plansForCrossPromotionTab(plans, planTab);
  return (
    <AppShell>
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        action={
          <Button
            onClick={() => {
              setEditingPlan(null);
              setOpen(true);
            }}
          >
            <Plus size={16} /> {header.actionLabel}
          </Button>
        }
      />
      {sectionTabs}
      {mutualModeTabs}
      <CrossPromotionPlanStatusTabs
        plans={plans}
        value={planTab}
        onChange={setPlanTab}
        ariaLabel={
          kind === "DIRECT_MUTUAL"
            ? "Direct exchange status"
            : "Own-channel promotion status"
        }
      />
      <div>
        {plansQuery.isLoading ? (
          <LoadingState />
        ) : plansQuery.isError ? (
          <ErrorState text="Could not load promotion placements." />
        ) : !visiblePlans.length ? (
          <EmptyState
            text={
              kind === "DIRECT_MUTUAL"
                ? `No ${planTab.toLowerCase()} direct exchanges.`
                : `No ${planTab.toLowerCase()} own-channel placements.`
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {visiblePlans.map((plan) => (
              <CrossPromotionPlanCard
                key={plan.id}
                plan={plan}
                onEdit={(source) => {
                  setEditingPlan(source);
                  setOpen(true);
                }}
                onDelete={() => setDeletePlan(plan)}
                onResume={(source) => resumeMutation.mutate(source)}
                onSendToBot={setBotNotificationPlan}
                onOpenPromo={setPreviewPromoId}
                onRefreshInviteLinks={(source) =>
                  refreshInviteLinksMutation.mutate(source.id)
                }
                refreshingInviteLinks={
                  refreshInviteLinksMutation.isPending &&
                  refreshInviteLinksMutation.variables === plan.id
                }
              />
            ))}
          </div>
        )}
      </div>
      <CrossPromotionPlanModal
        open={open}
        kind={kind}
        initial={editingPlan}
        mode={editingPlan ? "edit" : "create"}
        channels={channelsQuery.data ?? []}
        networks={networksQuery.data ?? []}
        loading={channelsQuery.isLoading || networksQuery.isLoading}
        saving={saveMutation.isPending || replaceAndPublishNowMutation.isPending || updatePublicationMutation.isPending || replacePublicationMutation.isPending}
        onClose={() => {
          setOpen(false);
          setEditingPlan(null);
        }}
        onSubmit={(payload) => saveMutation.mutateAsync(payload)}
        onReplaceAndPublishNow={(payload) =>
          replaceAndPublishNowMutation.mutateAsync(payload)
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
              queryKey: crossPromotionPlanKeys.list(kind),
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
      <Modal
        open={Boolean(botNotificationPlan)}
        onClose={() => {
          if (!sendToBotMutation.isPending) setBotNotificationPlan(null);
        }}
        title="Preview bot confirmation"
      >
        <div className="space-y-4">
          {botNotificationPreviewQuery.isLoading ? (
            <LoadingState />
          ) : botNotificationPreviewQuery.isError ? (
            <ErrorState text="Could not prepare the bot confirmation." />
          ) : (
            <div
              className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950/55 p-4 text-sm text-neutral-200 [&_a]:text-blue-300 [&_a]:underline"
              dangerouslySetInnerHTML={{
                __html: botNotificationPreviewQuery.data?.text ?? "",
              }}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={sendToBotMutation.isPending}
              onClick={() => setBotNotificationPlan(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !botNotificationPreviewQuery.data || sendToBotMutation.isPending
              }
              onClick={() => {
                if (!botNotificationPlan) return;
                sendToBotMutation.mutate(botNotificationPlan, {
                  onSuccess: () => setBotNotificationPlan(null),
                });
              }}
            >
              {sendToBotMutation.isPending ? "Sending…" : "Send to bot"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

export function MutualPromotionModeTabs({
  mode,
}: {
  mode: "direct" | "folders";
}) {
  return (
    <div className="mb-5 flex gap-2">
      <Link
        href="/ad-campaigns?section=mutual-promotion&mode=direct"
        className={`rounded-lg border px-3 py-2 text-sm ${mode === "direct" ? "border-blue-500 bg-blue-950/40 text-blue-200" : "border-neutral-800 text-neutral-400"}`}
      >
        🤝 Direct exchange
      </Link>
      <Link
        href="/ad-campaigns?section=mutual-promotion&mode=folders"
        className={`rounded-lg border px-3 py-2 text-sm ${mode === "folders" ? "border-blue-500 bg-blue-950/40 text-blue-200" : "border-neutral-800 text-neutral-400"}`}
      >
        📁 Folders
      </Link>
    </div>
  );
}
