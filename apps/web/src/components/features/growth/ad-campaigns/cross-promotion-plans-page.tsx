"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  CreateCrossPromotionPlanPayload,
  CrossPromotionPlan,
  CrossPromotionPlanKind,
} from "@telegram-system/shared";
import { telegramChannelNetworksApi, telegramChannelsApi } from "@/lib/api";
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
  LoadingState,
  MasonryGrid,
  PageHeader,
} from "@/components/ui/primitives";
import { CrossPromotionPlanModal } from "./cross-promotion-plan-modal";
import { CrossPromotionPlanCard } from "./cross-promotion-plan-card";
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
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => {
    const initialTick = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(interval);
    };
  }, []);
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
  const saveMutation = useMutation({
    mutationFn: async (payload: CreateCrossPromotionPlanPayload) => {
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
      await qc.invalidateQueries({
        queryKey: crossPromotionPlanKeys.list(kind),
      });
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
    },
  });
  const header = adsSectionHeader(
    kind === "DIRECT_MUTUAL" ? "mutual-promotion" : "own-promotion",
  );
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
        ) : !plansQuery.data?.length ? (
          <EmptyState text="No placements yet." />
        ) : (
          <MasonryGrid className="xl:grid-cols-2">
            {plansQuery.data.map((plan) => (
              <CrossPromotionPlanCard
                key={plan.id}
                plan={plan}
                clock={clock}
                onCopy={() => {
                  setEditingPlan(null);
                  setCopyFrom(plan);
                  setOpen(true);
                }}
                onEdit={() => {
                  setCopyFrom(null);
                  setEditingPlan(plan);
                  setOpen(true);
                }}
                onDelete={() => void deleteMutation.mutateAsync(plan.id)}
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
