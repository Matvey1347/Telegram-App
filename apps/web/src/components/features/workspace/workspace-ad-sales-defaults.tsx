"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/query-keys";

export function WorkspaceAdSalesDefaults({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: telegramAdSalesKeys.workspaceSettings(),
    queryFn: telegramAdSalesApi.getWorkspaceSettings,
  });
  const [postingCadenceDraft, setPostingCadenceDraft] = useState<string | null>(
    null,
  );
  const [commissionEnabledDraft, setCommissionEnabledDraft] = useState<
    boolean | null
  >(null);
  const [commissionRateDraft, setCommissionRateDraft] = useState<string | null>(
    null,
  );
  const postingCadence =
    postingCadenceDraft ??
    String(settings.data?.defaultOrganicPostsPerAdSlot ?? 3);
  const commissionEnabled =
    commissionEnabledDraft ?? settings.data?.salesCommissionEnabled ?? false;
  const commissionRate =
    commissionRateDraft ??
    String(settings.data?.defaultSalesCommissionRate ?? 0);
  const numericCommissionRate = Number(commissionRate);
  const commissionRateInvalid =
    !Number.isFinite(numericCommissionRate) ||
    numericCommissionRate < 0 ||
    numericCommissionRate > 100;
  const mutation = useMutation({
    mutationFn: telegramAdSalesApi.updateWorkspaceSettings,
    onSuccess: async () => {
      setPostingCadenceDraft(null);
      setCommissionEnabledDraft(null);
      setCommissionRateDraft(null);
      await queryClient.invalidateQueries({
        queryKey: telegramAdSalesKeys.workspaceSettings(),
      });
    },
  });

  return (
    <Card>
      <h3 className="text-lg font-semibold">Workspace defaults</h3>
      <p className="mt-1 text-sm text-neutral-400">
        Defaults for advertising sales and team compensation.
      </p>
      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h4 className="text-base font-semibold text-white">
          Advertising sales
        </h4>
        <div className="mt-4 max-w-xl">
          <label className="mb-1 block text-sm text-neutral-300">
            Organic posts per ad opportunity
          </label>
          <Input
            value={postingCadence}
            onChange={(event) => setPostingCadenceDraft(event.target.value)}
          />
        </div>
        {isOwner ? (
          <div className="mt-5 max-w-xl rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-white">Sales commission</div>
                <p className="mt-1 text-sm text-neutral-400">
                  Applies only to deals created after this setting is saved.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Enable sales commission"
                aria-checked={commissionEnabled}
                onClick={() => setCommissionEnabledDraft(!commissionEnabled)}
                className={`relative h-7 w-12 rounded-full transition ${commissionEnabled ? "bg-emerald-500" : "bg-neutral-700"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${commissionEnabled ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
            <label className="mb-1 mt-4 block text-sm text-neutral-300">
              Default commission, %
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commissionRate}
              onChange={(event) => setCommissionRateDraft(event.target.value)}
              disabled={!commissionEnabled}
            />
            {commissionRateInvalid ? (
              <p className="mt-1 text-xs text-rose-300">
                Commission must be between 0% and 100%.
              </p>
            ) : null}
          </div>
        ) : null}
        {mutation.isError ? (
          <p className="mt-3 text-sm text-rose-300">
            Could not save advertising sales defaults.
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() =>
              mutation.mutate({
                defaultOrganicPostsPerAdSlot: Number(postingCadence || 3),
                ...(isOwner
                  ? {
                      salesCommissionEnabled: commissionEnabled,
                      defaultSalesCommissionRate: numericCommissionRate,
                    }
                  : {}),
              })
            }
            disabled={
              mutation.isPending ||
              !postingCadence.trim() ||
              (isOwner && commissionRateInvalid)
            }
          >
            Save ad-sales defaults
          </Button>
        </div>
      </div>
    </Card>
  );
}
