"use client";

import { EyeOff, Pencil, Trash2, TrendingUp } from "lucide-react";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import type { AdHypothesis } from "@/lib/api";

export function AdHypothesisRowActions({
  hypothesis,
  onOpenHistory,
  onEdit,
  onToggleExclude,
  onDelete,
}: {
  hypothesis: AdHypothesis;
  onOpenHistory: (hypothesis: AdHypothesis) => void;
  onEdit: (hypothesis: AdHypothesis) => void;
  onToggleExclude: (
    hypothesis: AdHypothesis,
    excludeFromAnalytics: boolean,
  ) => void;
  onDelete: (hypothesis: AdHypothesis) => void;
}) {
  return (
    <CardActionsMenu label={`Actions for ${hypothesis.name}`}>
      <CardMenuAction
        label="Open trend"
        icon={<TrendingUp size={16} />}
        onClick={() => onOpenHistory(hypothesis)}
      />
      {hypothesis.isSystem ? null : (
        <>
          <CardMenuAction
            label="Edit hypothesis"
            icon={<Pencil size={16} />}
            onClick={() => onEdit(hypothesis)}
          />
          <CardMenuAction
            label={
              hypothesis.allCampaignsExcludedFromAnalytics
                ? "Include campaigns in analytics"
                : "Exclude campaigns from analytics"
            }
            icon={<EyeOff size={16} />}
            onClick={() =>
              onToggleExclude(
                hypothesis,
                !hypothesis.allCampaignsExcludedFromAnalytics,
              )
            }
          />
          <CardMenuAction
            label="Delete hypothesis"
            icon={<Trash2 size={16} />}
            danger
            onClick={() => onDelete(hypothesis)}
          />
        </>
      )}
    </CardActionsMenu>
  );
}
