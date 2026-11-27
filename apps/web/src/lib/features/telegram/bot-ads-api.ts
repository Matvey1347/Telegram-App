import type {
  BotAdCreative,
  BotAdChannelOption,
  BotAdLinkKind,
  CreateBotAdPlacements,
  BotAdLinkView,
  BotAdPromoView,
  BotAdsEnvironment,
  BotAdsLinksPage,
  BotAdsPage,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

export type BotAdsApiScope = { botId: string; environment: BotAdsEnvironment };
export type BotAdPlacementInput = {
  id: string;
  title: string;
  channelId?: string;
  promoId?: string;
};
type PromoInput = BotAdCreative & { title: string; iconId?: string | null };

function botAdsPath(scope: BotAdsApiScope) {
  return `/telegram-bots/${encodeURIComponent(scope.botId)}/ads`;
}

export const botAdsApi = {
  async promos(
    scope: BotAdsApiScope,
    state: "active" | "archive",
    offset: number,
  ) {
    return (
      await api.get<BotAdsPage<BotAdPromoView>>(`${botAdsPath(scope)}/promos`, {
        params: { environment: scope.environment, state, offset },
      })
    ).data;
  },
  async savePromo(scope: BotAdsApiScope, input: PromoInput, id?: string) {
    const path = `${botAdsPath(scope)}/promos`;
    const config = { params: { environment: scope.environment } };
    return id
      ? (await api.patch<BotAdPromoView>(`${path}/${id}`, input, config)).data
      : (await api.post<BotAdPromoView>(path, input, config)).data;
  },
  async archivePromo(scope: BotAdsApiScope, promo: BotAdPromoView) {
    return (
      await api.patch<BotAdPromoView>(
        `${botAdsPath(scope)}/promos/${promo.id}/archive`,
        { archived: !promo.archivedAt },
        { params: { environment: scope.environment } },
      )
    ).data;
  },
  async links(
    scope: BotAdsApiScope,
    offset: number,
    filters: { kind: BotAdLinkKind; promoId?: string; campaignId?: string },
  ) {
    return (
      await api.get<BotAdsLinksPage>(`${botAdsPath(scope)}/links`, {
        params: { environment: scope.environment, offset, ...filters },
        headers: { "X-Bypass-Response-Cache": "1" },
      })
    ).data;
  },
  async channels(scope: BotAdsApiScope, kind: BotAdLinkKind) {
    return (
      await api.get<BotAdChannelOption[]>(`${botAdsPath(scope)}/channels`, {
        params: { environment: scope.environment, kind },
      })
    ).data;
  },
  async placementPromos(scope: BotAdsApiScope) {
    return (
      await api.get<Pick<BotAdPromoView, "id" | "title" | "archivedAt" | "iconPresentation">[]>(
        `${botAdsPath(scope)}/placements/promos`,
        {
          params: { environment: scope.environment },
        },
      )
    ).data;
  },
  async createPlacements(scope: BotAdsApiScope, input: CreateBotAdPlacements) {
    return (
      await api.post<BotAdLinkView[]>(
        `${botAdsPath(scope)}/placements`,
        input,
        {
          params: { environment: scope.environment },
        },
      )
    ).data;
  },
  async createLink(scope: BotAdsApiScope, input: BotAdPlacementInput) {
    return (
      await api.post<BotAdLinkView>(`${botAdsPath(scope)}/links`, input, {
        params: { environment: scope.environment },
      })
    ).data;
  },
  async publish(scope: BotAdsApiScope, id: string, scheduledAt?: string) {
    return (
      await api.post<BotAdLinkView>(
        `${botAdsPath(scope)}/links/${id}/publish`,
        { scheduledAt },
        { params: { environment: scope.environment } },
      )
    ).data;
  },
};
