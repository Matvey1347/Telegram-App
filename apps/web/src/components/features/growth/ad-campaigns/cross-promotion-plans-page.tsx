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
  const header = adsSectionHeader(
    kind === "DIRECT_MUTUAL" ? "mutual-promotion" : "own-promotion",
  );
  const planGroups = groupPlansByPartner(plansQuery.data ?? []);
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
        ) : !planGroups.length ? (
          <EmptyState text="No placements yet." />
        ) : (
          <MasonryGrid className="xl:grid-cols-2">
            {planGroups.map(({ plan, integrations }) => (
              <CrossPromotionPlanCard
                key={plan.id}
                plan={plan}
                integrations={integrations}
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
                onOpenPromo={setPreviewPromoId}
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

function groupPlansByPartner(plans: CrossPromotionPlan[]) {
  const groups = new Map<string, CrossPromotionPlan[]>();
  for (const plan of plans) {
    const key = plan.advertiserId
      ? `advertiser:${plan.advertiserId}`
      : `partner-channels:${[...plan.partnerChannelIds].sort().join(",") || plan.id}`;
    const group = groups.get(key) ?? [];
    group.push(plan);
    groups.set(key, group);
  }
  return [...groups.values()].map((integrations) => {
    const ordered = [...integrations].sort(
      (left, right) =>
        Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt),
    );
    return { plan: ordered[0], integrations: ordered };
  });
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
