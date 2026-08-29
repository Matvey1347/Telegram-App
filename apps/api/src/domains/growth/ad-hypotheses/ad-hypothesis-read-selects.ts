import { WorkspaceService } from '../../../common/workspace.service';

export const AD_HYPOTHESIS_DETAIL_INCLUDE = {
  assignedMember: WorkspaceService.assignedMemberInclude,
  createdByUser: WorkspaceService.createdByUserInclude,
  icon: true,
  telegramChannel: true,
  campaigns: {
    include: {
      adCampaign: {
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          telegramChannel: {
            include: {
              inviteLinks: {
                select: { id: true, joinedCount: true, requestedCount: true },
              },
            },
          },
          promo: { include: { icon: true, telegramChannel: true } },
          promos: {
            include: {
              promo: { include: { icon: true, telegramChannel: true } },
            },
          },
          inviteLinks: {
            select: {
              id: true,
              telegramChannelId: true,
              adCampaignId: true,
              name: true,
              url: true,
              joinedCount: true,
              requestedCount: true,
              isRevoked: true,
              lastSyncedAt: true,
              createdAt: true,
              updatedAt: true,
              creatorTelegramUserId: true,
              creatorUsername: true,
              creatorFirstName: true,
              creatorLastName: true,
              creatorPhotoUrl: true,
              creatorMatchSource: true,
              creatorMember: WorkspaceService.assignedMemberInclude,
            },
          },
          advertisingTelegramChannels: {
            include: { telegramChannel: { include: { adminLinks: true } } },
          },
          advertisingChannels: { include: { advertisingSource: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

export const AD_HYPOTHESIS_LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  conclusion: true,
  iconId: true,
  telegramChannelId: true,
  createdAt: true,
  updatedAt: true,
  assignedMemberId: true,
  createdByUserId: true,
  icon: true,
  assignedMember: WorkspaceService.assignedMemberInclude,
  telegramChannel: {
    select: {
      id: true,
      title: true,
      username: true,
      photoUrl: true,
      targetCpaFrom: true,
      targetCpa: true,
      acceptableCpaFrom: true,
      acceptableCpa: true,
      stopCpaFrom: true,
      stopCpa: true,
    },
  },
  campaigns: {
    select: {
      adCampaign: {
        select: {
          id: true,
          title: true,
          status: true,
          currency: true,
          price: true,
          priceInPrimaryCurrency: true,
          joinedCount: true,
          newSubscribers: true,
          leftCount: true,
          sourcePostViews: true,
          sourcePostUrl: true,
          activeSubscribersFromAd: true,
          activeCpa: true,
          activeRate: true,
          retention7d: true,
          overallStatus: true,
          analyticsLastCalculatedAt: true,
          excludeFromAnalytics: true,
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
              targetCpaFrom: true,
              targetCpa: true,
              acceptableCpaFrom: true,
              acceptableCpa: true,
              stopCpaFrom: true,
              stopCpa: true,
            },
          },
          inviteLinks: { select: { joinedCount: true, requestedCount: true } },
          advertisingTelegramChannels: {
            select: {
              telegramChannel: { select: { title: true, username: true } },
            },
          },
          advertisingChannels: {
            select: { advertisingSource: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;
