"use client";

import { EyeOff, Pencil, Trash2, TrendingUp } from "lucide-react";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import type { AdCampaign } from "@/lib/api";

export function AdCampaignRowActions({
  campaign,
  onEdit,
  onDelete,
  onToggleExclude,
  onOpenHistory,
}: {
  campaign: AdCampaign;
  onEdit?: (campaign: AdCampaign) => void;
  onDelete?: (campaign: AdCampaign) => void;
  onToggleExclude?: (campaign: AdCampaign, excluded: boolean) => void;
  onOpenHistory: () => void;
}) {
  return (
    <CardActionsMenu label={`Actions for ${campaign.title}`}>
      {campaign.inviteLinks?.length ? (
        <CardMenuAction
          label="Open trend"
          icon={<TrendingUp size={16} />}
          onClick={onOpenHistory}
        />
      ) : null}
      {onEdit ? (
        <CardMenuAction
          label="Edit campaign"
          icon={<Pencil size={16} />}
          onClick={() => onEdit(campaign)}
        />
      ) : null}
      {onToggleExclude ? (
        <CardMenuAction
          label={
            campaign.excludeFromAnalytics
              ? "Include in analytics"
              : "Exclude from analytics"
          }
          icon={<EyeOff size={16} />}
          onClick={() =>
            onToggleExclude(campaign, !campaign.excludeFromAnalytics)
          }
        />
      ) : null}
      {onDelete ? (
        <CardMenuAction
          label="Delete campaign"
          icon={<Trash2 size={16} />}
          danger
          onClick={() => onDelete(campaign)}
        />
      ) : null}
    </CardActionsMenu>
  );
}
