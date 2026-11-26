import { PrismaService } from '../../../prisma/prisma.service';
import { campaignInviteWindowMetrics } from './ad-campaign-invite-window-metrics';

export async function campaignDetailMetrics(prisma: PrismaService, campaign: any) {
  const links = Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : campaign.id
    ? await prisma.telegramInviteLink.findMany({ where: { workspaceId: campaign.workspaceId, adCampaignId: campaign.id }, select: { id: true, joinedCount: true, requestedCount: true, joinedObservedAt: true, requestedObservedAt: true, joinedObserved: true, requestedObserved: true, lastSyncedAt: true } }) : [];
  const windows = campaign.id ? await prisma.adCampaignInviteLinkWindow.findMany({ where: { adCampaignId: campaign.id, inviteLink: { adCampaignId: campaign.id } }, select: { inviteLinkId: true, fromDate: true, currentRequests: true, peakPendingCount: true, timezone: true, joinedCount: true, pendingCount: true } }) : [];
  const counts = campaignInviteWindowMetrics(links, windows, campaign.startedAt ?? campaign.placementDate);
  const joinedCount = links.length ? counts.joined : Number(campaign.joinedCount ?? 0);
  const requestedCount = links.length ? counts.pending : Number(campaign.requestedCount ?? 0);
  const attributedCount = joinedCount == null || requestedCount == null ? null : joinedCount + requestedCount;
  const costAmount = Number(campaign.price || 0);
  return { joinedCount, requestedCount, attributedCount, leftCount: null, netGrowth: null, costAmount, currency: campaign.currency,
    costPerJoinedSubscriber: attributedCount && attributedCount > 0 ? costAmount / attributedCount : null,
    costPerNetSubscriber: null, attributionSource: 'mtproto_invite_link_usage', periodCountsUnavailable: counts.joined == null || counts.pending == null };
}
