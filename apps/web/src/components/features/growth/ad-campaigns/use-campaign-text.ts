"use client";

import { useOptionalI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";

const keys: Record<string, TranslationKey> = {
  "Campaign": "ads.campaign",
  "Performance": "ads.performance",
  "Actions": "ads.actions",
  "Hypotheses": "ads.hypotheses",
  "Spend": "ads.spend",
  "Attributed": "ads.attributed",
  "Joined": "ads.joined",
  "Pending": "ads.pending",
  "Peak": "ads.peak",
  "Drop from peak": "ads.drop_from_peak",
  "Bot requests": "ads.bot_requests",
  "KPI hit": "ads.kpi_hit",
  "KPI ok": "ads.kpi_ok",
  "KPI missed": "ads.kpi_missed",
  "KPI unknown": "ads.kpi_unknown",
  "Open trend": "ads.open_trend",
  "Edit campaign": "ads.edit_campaign",
  "Refresh invite-link data": "ads.refresh_invite_link_data",
  "Include in analytics": "ads.include_in_analytics",
  "Exclude from analytics": "ads.exclude_from_analytics",
  "Delete campaign": "ads.delete_campaign",
  "Open campaign trend": "ads.open_campaign_trend",
  "CPA is inside target KPI range.": "ads.cpa_is_inside_target_kpi_range",
  "CPA is inside acceptable KPI range.": "ads.cpa_is_inside_acceptable_kpi_range",
  "CPA is inside stop KPI range.": "ads.cpa_is_inside_stop_kpi_range",
  "KPI range or enough CPA data is missing.": "ads.kpi_range_or_enough_cpa_data_is_missing"
};

export function useCampaignText() {
  const i18n = useOptionalI18n();
  return (text: string) => keys[text] && i18n ? i18n.t(keys[text]) : text;
}
