"use client";

import { useCampaignText } from "./use-campaign-text";
import { EyeOff, Pencil, RefreshCw, Trash2, TrendingUp } from "lucide-react";
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
  onRefreshInviteLinks,
  refreshingInviteLinks = false,
  refreshInviteLinksProgress,
}: {
  campaign: AdCampaign;
  onEdit?: (campaign: AdCampaign) => void;
  onDelete?: (campaign: AdCampaign) => void;
  onToggleExclude?: (campaign: AdCampaign, excluded: boolean) => void;
  onOpenHistory: () => void;
  onRefreshInviteLinks?: (campaign: AdCampaign) => void;
  refreshingInviteLinks?: boolean;
  refreshInviteLinksProgress?: { current: number; total: number } | null;
}) {
  const t = useCampaignText();
  return (
    <CardActionsMenu label={`Actions for ${campaign.title}`}>
      {campaign.inviteLinks?.length ? (
        <CardMenuAction
          label={t("Open trend")}
          icon={<TrendingUp size={16} />}
          onClick={onOpenHistory}
        />
      ) : null}
      {onEdit ? (
        <CardMenuAction
          label={t("Edit campaign")}
          icon={<Pencil size={16} />}
          onClick={() => onEdit(campaign)}
        />
      ) : null}
      {onRefreshInviteLinks &&
      (campaign.inviteLinks?.length || campaign.botInviteLinks?.length) ? (
        <CardMenuAction
          label={
            refreshingInviteLinks
              ? `Refreshing invite links ${refreshInviteLinksProgress?.current ?? 0}/${refreshInviteLinksProgress?.total ?? "…"}`
              : t("Refresh invite-link data")
          }
          icon={<RefreshCw size={16} />}
          disabled={refreshingInviteLinks}
          onClick={() => onRefreshInviteLinks(campaign)}
        />
      ) : null}
      {onToggleExclude ? (
        <CardMenuAction
          label={
            campaign.excludeFromAnalytics
              ? t("Include in analytics")
              : t("Exclude from analytics")
          }
          icon={<EyeOff size={16} />}
          onClick={() =>
            onToggleExclude(campaign, !campaign.excludeFromAnalytics)
          }
        />
      ) : null}
      {onDelete ? (
        <CardMenuAction
          label={t("Delete campaign")}
          icon={<Trash2 size={16} />}
          danger
          onClick={() => onDelete(campaign)}
        />
      ) : null}
    </CardActionsMenu>
  );
}
