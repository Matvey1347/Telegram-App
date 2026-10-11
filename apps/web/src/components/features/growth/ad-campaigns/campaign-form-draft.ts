import { formatAdCampaignLocalDate } from "./ad-campaign-route-state";

export type CampaignValues = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  promoIds: string[];
  inviteLinkIds: string[];
  botInviteLinkIds: string[];
  trackingLinkKind: string;
  trackingChannelIds: string[];
  trackCrossChannelRequests: boolean;
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
      draft.botInviteLinkIds?.length ||
      draft.trackingChannelIds?.length ||
      draft.trackCrossChannelRequests ||
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
    botInviteLinkIds: Array.isArray(draft.botInviteLinkIds)
      ? draft.botInviteLinkIds.filter((id): id is string => typeof id === "string")
      : [],
    trackingLinkKind:
      typeof draft.trackingLinkKind === "string" ? draft.trackingLinkKind : "BOT",
    trackingChannelIds: Array.isArray(draft.trackingChannelIds)
      ? draft.trackingChannelIds.filter((id): id is string => typeof id === "string")
      : [],
    trackCrossChannelRequests:
      draft.trackCrossChannelRequests === true ||
      (Array.isArray(draft.trackingChannelIds) && draft.trackingChannelIds.length > 0) ||
      (Array.isArray(draft.botInviteLinkIds) && draft.botInviteLinkIds.length > 0),
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
