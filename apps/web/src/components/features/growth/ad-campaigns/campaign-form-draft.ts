import type { CampaignInviteRule } from "@telegram-system/shared";
import { formatAdCampaignLocalDate } from "./ad-campaign-route-state";

export type CampaignValues = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  promoIds: string[];
  inviteLinkIds: string[];
  inviteLinkWindows?: Record<string, CampaignInviteRule>;
  advertisingChannelIds: string[];
  price?: number;
  accountId?: string;
  date?: string;
  endedAt?: string;
  customTitle?: string;
  notes?: string;
};

export function isMeaningfulCampaignDraft(
  draft: CampaignValues,
  defaultDate = formatAdCampaignLocalDate(new Date()),
) {
  return Boolean(
    draft.telegramChannelId ||
      draft.promoIds?.length ||
      draft.inviteLinkIds?.length ||
      draft.advertisingChannelIds?.length ||
      Number(draft.price) ||
      draft.accountId ||
      draft.customTitle?.trim() ||
      draft.notes?.trim() ||
      (draft.date && draft.date !== defaultDate) ||
      draft.endedAt,
  );
}

export function normalizeCampaignDraft(value: unknown): CampaignValues | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<CampaignValues>;
  const rawPrice = (value as Record<string, unknown>).price;
  const date = typeof draft.date === "string" ? draft.date : undefined;
  return {
    telegramChannelId:
      typeof draft.telegramChannelId === "string" ? draft.telegramChannelId : "",
    assignedMemberId:
      typeof draft.assignedMemberId === "string" ? draft.assignedMemberId : null,
    promoIds: Array.isArray(draft.promoIds)
      ? draft.promoIds.filter((id): id is string => typeof id === "string")
      : [],
    inviteLinkIds: Array.isArray(draft.inviteLinkIds)
      ? draft.inviteLinkIds.filter((id): id is string => typeof id === "string")
      : [],
    inviteLinkWindows: draft.inviteLinkWindows && typeof draft.inviteLinkWindows === "object" ? Object.fromEntries(Object.entries(draft.inviteLinkWindows as Record<string, CampaignInviteRule | string>).flatMap<[string, CampaignInviteRule]>(([id, rule]) =>
      typeof rule === "string" ? [[id, { fromDate: rule }]] :
      rule && typeof rule === "object" ? [[id, { fromDate: typeof rule.fromDate === "string" ? rule.fromDate : null, currentRequests: rule.currentRequests === true }]] : [])) : {},
    advertisingChannelIds: Array.isArray(draft.advertisingChannelIds)
      ? draft.advertisingChannelIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    price:
      rawPrice == null || rawPrice === ""
        ? undefined
        : Number.isFinite(Number(rawPrice))
          ? Number(rawPrice)
          : undefined,
    accountId: typeof draft.accountId === "string" ? draft.accountId : "",
    date,
    endedAt: typeof draft.endedAt === "string" ? draft.endedAt : undefined,
    customTitle:
      typeof draft.customTitle === "string" ? draft.customTitle : "",
    notes: typeof draft.notes === "string" ? draft.notes : "",
  };
}
