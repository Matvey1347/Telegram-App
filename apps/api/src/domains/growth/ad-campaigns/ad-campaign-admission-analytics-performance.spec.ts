/* eslint-disable @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access -- focused performance test doubles */
import { AdCampaignAdmissionDetectionMode } from '@prisma/client';
import {
  admissionBatchFingerprint,
  AdmissionEvent,
} from './ad-campaign-admission-events';
import { AdCampaignAdmissionAnalyticsService } from './ad-campaign-admission-analytics.service';

const observedAt = new Date('2026-02-02T00:00:00.000Z');
const previousAt = new Date('2026-02-01T00:00:00.000Z');

function campaignFixture(index: number) {
  const id = `campaign-${index}`;
  return {
    id,
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    startedAt: null,
    placementDate: previousAt,
    createdAt: previousAt,
    inviteLinks: [
      {
        id: `link-${index}`,
        url: `https://t.me/+invite-${index}`,
        createsJoinRequest: true,
        createdAt: previousAt,
        telegramCreatedAt: null,
      },
    ],
  };
}

function prismaMock() {
  return {
    $queryRaw: jest.fn(),
    adCampaign: { findMany: jest.fn() },
    telegramInviteLinkSnapshot: { findMany: jest.fn() },
    adCampaignAdmissionBatch: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    adCampaignAdmissionViewSnapshot: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('AdCampaignAdmissionAnalyticsService batched snapshot reads', () => {
  it('retains one full-history snapshot read for historical backfill', async () => {
    const prisma = prismaMock();
    prisma.adCampaign.findMany.mockResolvedValue([campaignFixture(1)]);
    prisma.telegramInviteLinkSnapshot.findMany.mockResolvedValue([]);
    const analytics = new AdCampaignAdmissionAnalyticsService(prisma as any);

    await analytics.processHistoricalEvents({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      cutoffAt: observedAt,
    });

    expect(prisma.adCampaign.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramInviteLinkSnapshot.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramInviteLinkSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        adCampaignId: { in: ['campaign-1'] },
        inviteLinkId: { in: ['link-1'] },
        syncedAt: { lte: observedAt },
      },
      orderBy: [
        { adCampaignId: 'asc' },
        { inviteLinkId: 'asc' },
        { syncedAt: 'asc' },
      ],
      select: {
        adCampaignId: true,
        inviteLinkId: true,
        syncedAt: true,
        joinedCount: true,
        requestedCount: true,
      },
    });
  });

  it('merges the lower-bound predecessor with only in-range snapshots', async () => {
    const prisma = prismaMock();
    prisma.adCampaign.findMany.mockResolvedValue([campaignFixture(1)]);
    prisma.$queryRaw.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: previousAt,
        joinedCount: 5,
        requestedCount: 2,
      },
    ]);
    prisma.telegramInviteLinkSnapshot.findMany.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: observedAt,
        joinedCount: 8,
        requestedCount: 0,
      },
    ]);
    const analytics = new AdCampaignAdmissionAnalyticsService(
      prisma as any,
    ) as any;
    const createBatch = jest
      .spyOn(analytics, 'createBatchAndPoints')
      .mockResolvedValue({ batchId: null, created: false, pointsCreated: 0 });

    await analytics.processSnapshotRange({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      fromExclusive: previousAt,
      toInclusive: observedAt,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const predecessorQuery = prisma.$queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const predecessorSql = predecessorQuery.strings
      .join('?')
      .replace(/\s+/g, ' ');
    expect(predecessorSql).toContain(
      'WHERE snapshot."workspaceId" = ? AND snapshot."telegramChannelId" = ?',
    );
    expect(predecessorSql).toContain(
      'snapshot."adCampaignId" IN (?) AND snapshot."inviteLinkId" IN (?)',
    );
    expect(predecessorSql).toContain(
      'ORDER BY snapshot."inviteLinkId" ASC, snapshot."syncedAt" DESC, snapshot."id" DESC',
    );
    expect(predecessorQuery.values).toEqual([
      'workspace-1',
      'channel-1',
      'campaign-1',
      'link-1',
      previousAt,
    ]);
    expect(prisma.telegramInviteLinkSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          adCampaignId: { in: ['campaign-1'] },
          inviteLinkId: { in: ['link-1'] },
          syncedAt: { gt: previousAt, lte: observedAt },
        },
        orderBy: [
          { adCampaignId: 'asc' },
          { inviteLinkId: 'asc' },
          { syncedAt: 'asc' },
        ],
      }),
    );
    expect(createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          detectionMode: AdCampaignAdmissionDetectionMode.EXACT_DELTA,
          previousSnapshotAt: previousAt,
          currentSnapshotAt: observedAt,
          sourceLinks: [expect.objectContaining({ joinedDelta: 3 })],
        }),
      }),
    );
  });

  it('bootstraps the first in-range joined snapshot when no predecessor exists', async () => {
    const prisma = prismaMock();
    prisma.adCampaign.findMany.mockResolvedValue([campaignFixture(1)]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.telegramInviteLinkSnapshot.findMany.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: observedAt,
        joinedCount: 7,
        requestedCount: 0,
      },
    ]);
    const analytics = new AdCampaignAdmissionAnalyticsService(
      prisma as any,
    ) as any;
    const createBatch = jest
      .spyOn(analytics, 'createBatchAndPoints')
      .mockResolvedValue({ batchId: null, created: false, pointsCreated: 0 });

    await analytics.processSnapshotRange({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      fromExclusive: previousAt,
      toInclusive: observedAt,
    });

    expect(createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          detectionMode:
            AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE,
          previousSnapshotAt: null,
          sourceLinks: [expect.objectContaining({ joinedDelta: 7 })],
        }),
      }),
    );
  });

  it('keeps two bounded snapshot reads for 100 recurring campaigns', async () => {
    const campaigns = Array.from({ length: 100 }, (_, index) =>
      campaignFixture(index + 1),
    );
    const prisma = prismaMock();
    prisma.adCampaign.findMany.mockResolvedValue(campaigns);
    prisma.$queryRaw.mockResolvedValue(
      campaigns.map((campaign, index) => ({
        adCampaignId: campaign.id,
        inviteLinkId: campaign.inviteLinks[0].id,
        syncedAt: previousAt,
        joinedCount: 0,
        requestedCount: index + 1,
      })),
    );
    prisma.telegramInviteLinkSnapshot.findMany.mockResolvedValue(
      campaigns.map((campaign, index) => ({
        adCampaignId: campaign.id,
        inviteLinkId: campaign.inviteLinks[0].id,
        syncedAt: observedAt,
        joinedCount: index + 1,
        requestedCount: 0,
      })),
    );
    const analytics = new AdCampaignAdmissionAnalyticsService(
      prisma as any,
    ) as any;
    const createBatch = jest
      .spyOn(analytics, 'createBatchAndPoints')
      .mockResolvedValue({ batchId: null, created: false, pointsCreated: 0 });

    const result = await analytics.processSnapshotRange({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      fromExclusive: previousAt,
      toInclusive: observedAt,
    });

    expect(result).toEqual({
      createdBatches: 0,
      createdPoints: 0,
      processedCampaigns: 100,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.telegramInviteLinkSnapshot.findMany).toHaveBeenCalledTimes(1);
    expect(createBatch).toHaveBeenCalledTimes(100);
    for (const [index, call] of createBatch.mock.calls.entries()) {
      const { campaign, event } = call[0] as {
        campaign: { id: string };
        event: AdmissionEvent;
      };
      expect(event.adCampaignId).toBe(campaign.id);
      expect(event.sourceLinks).toEqual([
        expect.objectContaining({
          telegramInviteLinkId: `link-${index + 1}`,
          joinedDelta: index + 1,
        }),
      ]);
    }
  });

  it('performs no writes when batched snapshots contain no joined change', async () => {
    const prisma = prismaMock();
    prisma.adCampaign.findMany.mockResolvedValue([campaignFixture(1)]);
    prisma.$queryRaw.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: previousAt,
        joinedCount: 0,
        requestedCount: 10,
      },
    ]);
    prisma.telegramInviteLinkSnapshot.findMany.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: observedAt,
        joinedCount: 0,
        requestedCount: 0,
      },
    ]);
    const analytics = new AdCampaignAdmissionAnalyticsService(prisma as any);

    const result = await (analytics as any).processSnapshotRange({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      fromExclusive: previousAt,
      toInclusive: observedAt,
    });

    expect(result).toEqual({
      createdBatches: 0,
      createdPoints: 0,
      processedCampaigns: 1,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.adCampaignAdmissionBatch.update).not.toHaveBeenCalled();
    expect(prisma.adCampaignAdmissionBatch.create).not.toHaveBeenCalled();
    expect(
      prisma.adCampaignAdmissionViewSnapshot.deleteMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.adCampaignAdmissionViewSnapshot.upsert,
    ).not.toHaveBeenCalled();
  });
});

describe('admission event fingerprint compatibility', () => {
  it('retains the established sorted source-link fingerprint', () => {
    const event: AdmissionEvent = {
      adCampaignId: 'campaign-regression',
      telegramChannelId: 'channel-1',
      detectionMode: AdCampaignAdmissionDetectionMode.EXACT_DELTA,
      previousSnapshotAt: new Date('2026-01-01T00:00:00.000Z'),
      currentSnapshotAt: new Date('2026-01-02T00:00:00.000Z'),
      sourceLinks: [
        {
          telegramInviteLinkId: 'link-b',
          inviteLink: 'https://t.me/+b',
          previousSnapshotAt: previousAt,
          currentSnapshotAt: observedAt,
          joinedDelta: 4,
          joinedBefore: 1,
          joinedAfter: 5,
          requestedBefore: 6,
          requestedAfter: 2,
          createsJoinRequest: true,
        },
        {
          telegramInviteLinkId: 'link-a',
          inviteLink: 'https://t.me/+a',
          previousSnapshotAt: previousAt,
          currentSnapshotAt: observedAt,
          joinedDelta: 3,
          joinedBefore: 2,
          joinedAfter: 5,
          requestedBefore: 7,
          requestedAfter: 4,
          createsJoinRequest: true,
        },
      ],
    };

    expect(admissionBatchFingerprint(event.adCampaignId, event)).toBe(
      '4ccc78f97ce30931ff03ec752098664e2ce4a84af7e92958e5b330db0b76954a',
    );
  });
});
