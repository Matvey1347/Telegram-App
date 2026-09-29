"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
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
  MasonryGrid,
  PageHeader,
} from "@/components/ui/primitives";
import { CrossPromotionPlanModal } from "./cross-promotion-plan-modal";
import { CrossPromotionPlanCard } from "./cross-promotion-plan-card";
import { PromoFormModal } from "./promo-form-modal";
import { adsSectionHeader } from "./ads-section-header";
import { useAppToast } from "@/providers/toast-provider";

export function CrossPromotionPlansPage({
  kind,
  sectionTabs,
  mutualModeTabs,
}: {
  kind: CrossPromotionPlanKind;
  sectionTabs: ReactNode;
  mutualModeTabs?: ReactNode;
}) {
  const qc = useQueryClient();
  const { startOperation } = useAppToast();
  const [open, setOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<CrossPromotionPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<CrossPromotionPlan | null>(
    null,
  );
  const [deletePlan, setDeletePlan] = useState<CrossPromotionPlan | null>(null);
  const [previewPromoId, setPreviewPromoId] = useState<string | null>(null);
  const plansQuery = useQuery({
    queryKey: crossPromotionPlanKeys.list(kind),
    queryFn: () => crossPromotionPlansApi.list(kind),
  });
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
      setCopyFrom(null);
      setEditingPlan(null);
    },
    // A stream can disconnect after the server has already persisted a
    // partial plan. Refresh it so the user can continue that exact plan
    // instead of submitting the browser draft as a duplicate.
    onError: async () => {
      await qc.invalidateQueries({ queryKey: crossPromotionPlanKeys.list(kind) });
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
  return (
    <AppShell>
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        action={
          <Button
            onClick={() => {
              setCopyFrom(null);
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
      <div>
        {plansQuery.isLoading ? (
          <LoadingState />
        ) : plansQuery.isError ? (
          <ErrorState text="Could not load promotion placements." />
        ) : !plans.length ? (
          <EmptyState text="No placements yet." />
        ) : (
          <MasonryGrid className="xl:grid-cols-2">
            {plans.map((plan) => (
              <CrossPromotionPlanCard
                key={plan.id}
                plan={plan}
                onCopy={(source) => {
                  setEditingPlan(null);
                  setCopyFrom(source);
                  setOpen(true);
                }}
                onEdit={(source) => {
                  setCopyFrom(null);
                  setEditingPlan(source);
                  setOpen(true);
                }}
                onDelete={() => setDeletePlan(plan)}
                onResume={(source) => resumeMutation.mutate(source)}
                onSendToBot={(source) => sendToBotMutation.mutate(source)}
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
          </MasonryGrid>
        )}
      </div>
      <CrossPromotionPlanModal
        open={open}
        kind={kind}
        initial={editingPlan ?? copyFrom}
        mode={editingPlan ? "edit" : copyFrom ? "copy" : "create"}
        channels={channelsQuery.data ?? []}
        networks={networksQuery.data ?? []}
        loading={channelsQuery.isLoading || networksQuery.isLoading}
        saving={saveMutation.isPending}
        onClose={() => {
          setOpen(false);
          setCopyFrom(null);
          setEditingPlan(null);
        }}
        onSubmit={(payload) => saveMutation.mutateAsync(payload)}
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
