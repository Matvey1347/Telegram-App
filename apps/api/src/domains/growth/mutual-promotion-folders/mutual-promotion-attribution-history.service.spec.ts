import { MutualPromotionAttributionHistoryService } from './mutual-promotion-attribution-history.service';

describe('MutualPromotionAttributionHistoryService', () => {
  const participant = {
    id: 'participant-1',
    role: 'PUBLISHER' as const,
    telegramChannelId: 'channel-1',
    inviteLinkId: 'link-1',
    subscribersAtStart: 100,
    subscribersAtEnd: null,
    inviteJoinedAtStart: 10,
    inviteJoinedAtEnd: null,
    inviteRequestedAtStart: 3,
    inviteRequestedAtEnd: null,
    baselineCapturedAt: new Date('2026-09-01T08:00:00.000Z'),
    finalCapturedAt: null,
    telegramChannel: { currentSubscribersCount: 103 },
    inviteLink: { joinedCount: 15, requestedCount: 5 },
  };

  it('builds joined and estimated unsubscribe history until the next folder', async () => {
    const nextStart = new Date('2026-09-10T08:00:00.000Z');
    const sampleAt = new Date('2026-09-05T08:00:00.000Z');
    const prisma = {
      mutualPromotionFolder: {
        findFirst: jest.fn().mockResolvedValue({ startsAt: nextStart }),
      },
      telegramInviteLinkSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            inviteLinkId: 'link-1',
            syncedAt: sampleAt,
            joinedCount: 15,
            requestedCount: 5,
          },
        ]),
      },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannelId: 'channel-1',
            collectedAt: sampleAt,
            subscribersCount: 103,
          },
        ]),
      },
    };

    const result = await new MutualPromotionAttributionHistoryService(
      prisma as never,
    ).load({
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      folderStartsAt: participant.baselineCapturedAt,
      participants: [participant],
    });

    expect(result.get('participant-1')).toEqual(
      expect.objectContaining({
        endsAt: nextStart.toISOString(),
        endsAtSource: 'NEXT_FOLDER',
        points: [
          {
            at: participant.baselineCapturedAt.toISOString(),
            joinedCount: 0,
            requestedCount: 0,
            acquiredCount: 0,
            audienceDelta: 0,
            unsubscribedCount: 0,
          },
          {
            at: sampleAt.toISOString(),
            joinedCount: 5,
            requestedCount: 2,
            acquiredCount: 7,
            audienceDelta: 3,
            unsubscribedCount: 4,
          },
          {
            at: nextStart.toISOString(),
            joinedCount: 5,
            requestedCount: 2,
            acquiredCount: 7,
            audienceDelta: 3,
            unsubscribedCount: 4,
          },
        ],
      }),
    );
  });

  it('does not invent a history when the activation baseline is missing', async () => {
    const prisma = {
      mutualPromotionFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const result = await new MutualPromotionAttributionHistoryService(
      prisma as never,
    ).load({
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      folderStartsAt: participant.baselineCapturedAt,
      participants: [
        {
          ...participant,
          subscribersAtStart: null,
          inviteJoinedAtStart: null,
        },
      ],
    });

    expect(result.get('participant-1')?.points).toEqual([]);
  });

  it('keeps paid-channel history limited to invite-link arrivals', async () => {
    const sampleAt = new Date('2026-09-05T08:00:00.000Z');
    const prisma = {
      mutualPromotionFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramInviteLinkSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            inviteLinkId: 'link-1',
            syncedAt: sampleAt,
            joinedCount: 15,
            requestedCount: 5,
          },
        ]),
      },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const result = await new MutualPromotionAttributionHistoryService(
      prisma as never,
    ).load({
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      folderStartsAt: participant.baselineCapturedAt,
      participants: [{ ...participant, role: 'PAID' }],
    });

    expect(result.get('participant-1')?.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          at: sampleAt.toISOString(),
          joinedCount: 5,
          requestedCount: 2,
          acquiredCount: 7,
          audienceDelta: null,
          unsubscribedCount: null,
        }),
      ]),
    );
  });

  it('freezes completed-folder history at the saved final boundary', async () => {
    const finalCapturedAt = new Date('2026-09-06T08:00:00.000Z');
    const afterFinal = new Date('2026-09-07T08:00:00.000Z');
    const prisma = {
      mutualPromotionFolder: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramInviteLinkSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            inviteLinkId: 'link-1',
            syncedAt: afterFinal,
            joinedCount: 99,
            requestedCount: 10,
          },
        ]),
      },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const result = await new MutualPromotionAttributionHistoryService(
      prisma as never,
    ).load({
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      folderStartsAt: participant.baselineCapturedAt,
      participants: [
        {
          ...participant,
          finalCapturedAt,
          inviteJoinedAtEnd: 15,
          inviteRequestedAtEnd: 5,
          subscribersAtEnd: 103,
          inviteLink: { joinedCount: 99, requestedCount: 10 },
        },
      ],
    });

    expect(result.get('participant-1')).toEqual({
      startsAt: participant.baselineCapturedAt.toISOString(),
      endsAt: finalCapturedAt.toISOString(),
      endsAtSource: 'FINAL_CAPTURE',
      points: [
        {
          at: participant.baselineCapturedAt.toISOString(),
          joinedCount: 0,
          requestedCount: 0,
          acquiredCount: 0,
          audienceDelta: 0,
          unsubscribedCount: 0,
        },
        {
          at: finalCapturedAt.toISOString(),
          joinedCount: 5,
          requestedCount: 2,
          acquiredCount: 7,
          audienceDelta: 3,
          unsubscribedCount: 4,
        },
      ],
    });
  });

  it('does no database work for a folder without participants', async () => {
    const prisma = {
      mutualPromotionFolder: { findFirst: jest.fn() },
      telegramInviteLinkSnapshot: { findMany: jest.fn() },
      telegramChannelAudienceSnapshot: { findMany: jest.fn() },
    };

    await expect(
      new MutualPromotionAttributionHistoryService(prisma as never).load({
        workspaceId: 'workspace-1',
        folderId: 'folder-1',
        folderStartsAt: new Date(),
        participants: [],
      }),
    ).resolves.toEqual(new Map());
    expect(prisma.mutualPromotionFolder.findFirst).not.toHaveBeenCalled();
  });
});
