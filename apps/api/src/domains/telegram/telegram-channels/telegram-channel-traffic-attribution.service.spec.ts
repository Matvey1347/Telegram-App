/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma read doubles and Jest asymmetric matchers */
import { NotFoundException } from '@nestjs/common';
import { TelegramChannelTrafficAttributionReadService } from './telegram-channel-traffic-attribution-read.service';
import { TelegramChannelTrafficAttributionService } from './telegram-channel-traffic-attribution.service';

function createService(prisma: object, support: object = {}) {
  return new TelegramChannelTrafficAttributionService(
    new TelegramChannelTrafficAttributionReadService(prisma as never),
    support as never,
    {
      prepareRateSource: jest.fn().mockResolvedValue({
        convertCurrency: jest.fn().mockResolvedValue(null),
      }),
    } as never,
  );
}

describe('TelegramChannelTrafficAttributionService', () => {
  it('builds channel-card sources in one batched read', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            mutualPromotionInviteLinkIds: [],
            folderDefaultInviteLinkIds: [],
            audienceTransferInviteLinkId: null,
            botInviteLinkId: 'bot-link',
            broadcastInviteLinkId: null,
          },
        ]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bot-link',
            telegramChannelId: 'channel-1',
            adCampaignId: null,
            name: 'Bot',
            url: 'https://t.me/+bot',
            joinedCount: 8,
            requestedCount: 2,
            peakAttributedCount: 12,
          },
          {
            id: 'ad-link',
            telegramChannelId: 'channel-1',
            adCampaignId: 'campaign-1',
            name: 'Ads',
            url: 'https://t.me/+ads',
            joinedCount: 15,
            requestedCount: 5,
            peakAttributedCount: 25,
          },
        ]),
      },
      adCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-1',
            telegramChannelId: 'channel-1',
            title: 'September campaign',
            status: 'finished',
            startedAt: new Date('2026-09-01T00:00:00.000Z'),
            endedAt: new Date('2026-09-03T00:00:00.000Z'),
            price: 11_241,
            currency: 'UAH',
            priceInPrimaryCurrency: 200,
            joinedCount: 15,
            newSubscribers: 20,
          },
        ]),
      },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      crossPromotionPlan: { findMany: jest.fn().mockResolvedValue([]) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
    };
    const service = createService(prisma);

    const result = await service.summariesForChannels('workspace-1', [
      'channel-1',
    ]);

    expect(result.get('channel-1')).toEqual(
      expect.objectContaining({
        acquired: 37,
        retained: 30,
        unsubscribed: 7,
        spend: 11_241,
      }),
    );
    expect(result.get('channel-1')?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'AD_CAMPAIGNS', acquired: 25 }),
        expect.objectContaining({ kind: 'BOT', acquired: 12 }),
      ]),
    );
    expect(prisma.crossPromotionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          kind: 'DIRECT_MUTUAL',
          OR: [
            {
              targets: {
                array_contains: [{ telegramChannelId: 'channel-1' }],
              },
            },
          ],
        }),
      }),
    );
    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ peakAttributedCount: true }),
      }),
    );
  });

  it('claims a link once using campaign, folder, mutual priority', async () => {
    const link = {
      id: 'shared-link',
      telegramChannelId: 'channel-1',
      adCampaignId: 'campaign-1',
      name: 'Shared',
      url: 'https://t.me/+shared',
      joinedCount: 10,
      requestedCount: 0,
      peakAttributedCount: 12,
    };
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            mutualPromotionInviteLinkIds: ['shared-link'],
            folderDefaultInviteLinkIds: ['shared-link'],
            audienceTransferInviteLinkId: null,
            botInviteLinkId: null,
            broadcastInviteLinkId: null,
          },
        ]),
      },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([link]) },
      adCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-1',
            telegramChannelId: 'channel-1',
            title: 'Campaign',
            status: 'finished',
            startedAt: null,
            endedAt: null,
            priceInPrimaryCurrency: 100,
            joinedCount: 10,
            newSubscribers: 10,
          },
        ]),
      },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'participant-1',
            telegramChannelId: 'channel-1',
            inviteLinkId: 'shared-link',
            role: 'PUBLISHER',
            subscribersAtStart: 100,
            subscribersAtEnd: 108,
            inviteJoinedAtStart: 0,
            inviteJoinedAtEnd: 10,
            inviteRequestedAtStart: 0,
            inviteRequestedAtEnd: 0,
            baselineCapturedAt: null,
            finalCapturedAt: null,
            folder: {
              title: 'Folder',
              startsAt: new Date(),
              endsAt: new Date(),
            },
            expense: null,
          },
        ]),
      },
      crossPromotionPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'plan-1',
            title: 'Mutual',
            targets: [
              { telegramChannelId: 'channel-1', inviteLinkId: 'shared-link' },
            ],
            baselineTargetCounters: [],
            scheduledAt: new Date(),
            trackingEndsAt: null,
          },
        ]),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
    };
    const service = createService(prisma);

    const result = await service.summariesForChannels('workspace-1', [
      'channel-1',
    ]);

    expect(result.get('channel-1')?.sources).toEqual([
      expect.objectContaining({
        kind: 'AD_CAMPAIGNS',
        sourceCount: 1,
        linkCount: 1,
      }),
    ]);
    expect(result.get('channel-1')?.acquired).toBe(12);
  });

  it('keeps channel purchase investment out of traffic-source CPA', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            currentSubscribersCount: 841,
            purchaseTransactionId: null,
            mutualPromotionInviteLinkIds: [],
            folderDefaultInviteLinkIds: [],
            audienceTransferInviteLinkId: null,
            botInviteLinkId: null,
            broadcastInviteLinkId: null,
          },
        ]),
      },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      adCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      crossPromotionPlan: { findMany: jest.fn().mockResolvedValue([]) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
    };
    const service = createService(prisma);

    const result = await service.summariesForChannels('workspace-1', [
      'channel-1',
    ]);

    expect(result.get('channel-1')).toEqual(
      expect.objectContaining({ spend: null, averageSubscriberCost: null }),
    );
  });

  it('uses a campaign native amount when its stored primary value predates the workspace currency', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            mutualPromotionInviteLinkIds: [],
            folderDefaultInviteLinkIds: [],
            audienceTransferInviteLinkId: null,
            botInviteLinkId: null,
            broadcastInviteLinkId: null,
          },
        ]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-link',
            telegramChannelId: 'channel-1',
            adCampaignId: 'campaign-1',
            name: 'Campaign link',
            url: 'https://t.me/+campaign',
            joinedCount: 593,
            requestedCount: 13,
            peakAttributedCount: 1_058,
          },
        ]),
      },
      adCampaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'campaign-1',
            telegramChannelId: 'channel-1',
            title: 'Campaign',
            status: 'finished',
            startedAt: null,
            endedAt: null,
            price: 11_241,
            currency: 'UAH',
            priceInPrimaryCurrency: 252.3,
            joinedCount: 593,
            newSubscribers: 606,
          },
        ]),
      },
      mutualPromotionFolderParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      crossPromotionPlan: { findMany: jest.fn().mockResolvedValue([]) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
    };

    const result = await createService(prisma).summariesForChannels(
      'workspace-1',
      ['channel-1'],
    );

    expect(result.get('channel-1')).toMatchObject({
      spend: 11_241,
      retained: 606,
    });
    expect(result.get('channel-1')?.retainedSubscriberCost).toBeCloseTo(
      18.55,
      2,
    );
  });

  it('stops direct-mutual attribution at the saved tracking boundary', async () => {
    const service = new TelegramChannelTrafficAttributionService(
      {
        batch: jest.fn().mockResolvedValue({
          channels: [
            {
              id: 'channel-1',
              currentSubscribersCount: 120,
              mutualPromotionInviteLinkIds: [],
              folderDefaultInviteLinkIds: [],
              audienceTransferInviteLinkId: null,
              botInviteLinkId: null,
              broadcastInviteLinkId: null,
            },
          ],
          links: [
            {
              id: 'mutual-link',
              telegramChannelId: 'channel-1',
              adCampaignId: null,
              name: 'Mutual link',
              url: 'https://t.me/+mutual',
              joinedCount: 90,
              requestedCount: 0,
              peakAttributedCount: 90,
            },
          ],
          campaigns: [],
          participants: [],
          plans: [
            {
              id: 'plan-1',
              title: 'Finished mutual placement',
              targets: [
                {
                  telegramChannelId: 'channel-1',
                  inviteLinkId: 'mutual-link',
                },
              ],
              baselineTargetCounters: [
                {
                  inviteLinkId: 'mutual-link',
                  joinedCount: 10,
                  requestedCount: 0,
                },
              ],
              scheduledAt: new Date('2026-09-01T00:00:00.000Z'),
              trackingEndsAt: new Date('2026-09-02T00:00:00.000Z'),
            },
          ],
          planBoundaryCounters: [
            {
              planId: 'plan-1',
              inviteLinkId: 'mutual-link',
              joinedCount: 25,
              requestedCount: 0,
            },
          ],
          currency: 'USD',
        }),
      } as never,
      {} as never,
      {} as never,
    );

    const result = await service.summariesForChannels('workspace-1', [
      'channel-1',
    ]);

    expect(result.get('channel-1')?.sources).toEqual([
      expect.objectContaining({ kind: 'MUTUAL_PROMOTION', acquired: 15 }),
    ]);
  });

  it('keeps separate folder windows when the same link is reused', async () => {
    const folderParticipant = (id: string, start: number, end: number) => ({
      id,
      telegramChannelId: 'channel-1',
      inviteLinkId: 'folder-link',
      role: 'PUBLISHER',
      subscribersAtStart: 100,
      subscribersAtEnd: 100 + end - start,
      inviteJoinedAtStart: start,
      inviteJoinedAtEnd: end,
      inviteRequestedAtStart: 0,
      inviteRequestedAtEnd: 0,
      baselineCapturedAt: new Date(`2026-0${start / 10}-01T00:00:00.000Z`),
      finalCapturedAt: new Date(`2026-0${start / 10}-02T00:00:00.000Z`),
      folder: {
        title: `Folder ${id}`,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      expense: null,
    });
    const service = createService({
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            mutualPromotionInviteLinkIds: [],
            folderDefaultInviteLinkIds: ['folder-link'],
            audienceTransferInviteLinkId: null,
            botInviteLinkId: null,
            broadcastInviteLinkId: null,
          },
        ]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'folder-link',
            telegramChannelId: 'channel-1',
            adCampaignId: null,
            name: 'Folder link',
            url: 'https://t.me/+folder',
            joinedCount: 40,
            requestedCount: 0,
            peakAttributedCount: 40,
          },
        ]),
      },
      adCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      mutualPromotionFolderParticipant: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            folderParticipant('one', 10, 20),
            folderParticipant('two', 20, 40),
          ]),
      },
      crossPromotionPlan: { findMany: jest.fn().mockResolvedValue([]) },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }),
      },
    });

    const result = await service.summariesForChannels('workspace-1', [
      'channel-1',
    ]);

    expect(result.get('channel-1')?.sources).toEqual([
      expect.objectContaining({
        kind: 'FOLDERS',
        sourceCount: 2,
        linkCount: 1,
        acquired: 30,
      }),
    ]);
  });

  it('keeps the 100-channel card path to six bounded reads', async () => {
    const channelIds = Array.from(
      { length: 100 },
      (_, index) => `channel-${index + 1}`,
    );
    const telegramChannelFindMany = jest.fn().mockResolvedValue(
      channelIds.map((id) => ({
        id,
        mutualPromotionInviteLinkIds: [],
        folderDefaultInviteLinkIds: [],
        audienceTransferInviteLinkId: null,
        botInviteLinkId: null,
        broadcastInviteLinkId: null,
      })),
    );
    const telegramInviteLinkFindMany = jest.fn().mockResolvedValue([]);
    const adCampaignFindMany = jest.fn().mockResolvedValue([]);
    const participantFindMany = jest.fn().mockResolvedValue([]);
    const planFindMany = jest.fn().mockResolvedValue([]);
    const workspaceFindUnique = jest
      .fn()
      .mockResolvedValue({ primaryCurrency: 'USD' });
    const service = createService({
      telegramChannel: { findMany: telegramChannelFindMany },
      telegramInviteLink: { findMany: telegramInviteLinkFindMany },
      adCampaign: { findMany: adCampaignFindMany },
      mutualPromotionFolderParticipant: { findMany: participantFindMany },
      crossPromotionPlan: { findMany: planFindMany },
      workspace: { findUnique: workspaceFindUnique },
    });

    const result = await service.summariesForChannels(
      'workspace-1',
      channelIds,
    );

    expect(result.size).toBe(100);
    for (const query of [
      telegramChannelFindMany,
      telegramInviteLinkFindMany,
      adCampaignFindMany,
      participantFindMany,
      planFindMany,
      workspaceFindUnique,
    ]) {
      expect(query).toHaveBeenCalledTimes(1);
    }
    expect(planFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              targets: {
                array_contains: [{ telegramChannelId: 'channel-100' }],
              },
            },
          ]),
        }),
      }),
    );
  });

  it('rejects detail reads outside the current workspace', async () => {
    const service = createService(
      {
        telegramChannel: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      { workspace: jest.fn().mockResolvedValue('workspace-1') },
    );

    await expect(service.detail('user-1', 'other-channel')).rejects.toThrow(
      new NotFoundException('Telegram channel not found'),
    );
  });
});
