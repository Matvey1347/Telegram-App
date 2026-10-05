import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramPublicationSchedulesService } from './telegram-publication-schedules.service';

describe('TelegramPublicationSchedulesService', () => {
  const prisma: any = {
    workspace: { findUnique: jest.fn() },
    telegramChannel: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramChannelPublicationScheduleAssignment: { findMany: jest.fn() },
    telegramPublicationSchedule: { findFirst: jest.fn() },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAdSalePlacement: { findMany: jest.fn().mockResolvedValue([]) },
    crossPromotionPlan: { findMany: jest.fn().mockResolvedValue([]) },
    icon: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspace: any = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const service = new TelegramPublicationSchedulesService(prisma, workspace);

  beforeEach(() => jest.clearAllMocks());

  it('rejects SUBSET assignments without selected slots', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
    prisma.telegramPublicationSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      slots: [{ id: 'slot-1' }],
    });
    await expect(
      service.assign('user-1', 'channel-1', {
        scheduleId: 'schedule-1',
        selectionMode: 'SUBSET',
        selectedSlotIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps canonical UTC publication slots at the same instant across a DST boundary', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      timezone: 'Europe/Warsaw',
    });
    jest.spyOn(service, 'assignment').mockResolvedValue({
      id: 'assignment-1',
      channelId: 'channel-1',
      scheduleId: 'schedule-1',
      selectionMode: 'FULL',
      selectedSlotIds: [],
      updatedAt: '',
      schedule: {
        id: 'schedule-1',
        name: 'Main',
        iconId: null,
        iconPresentation: null,
        timezone: 'Europe/Warsaw',
        isDefault: true,
        assignedChannelsCount: 1,
        assignedChannelIds: ['channel-1'],
        createdAt: '',
        updatedAt: '',
        slots: [
          {
            id: 'morning',
            scheduleId: 'schedule-1',
            title: 'Morning',
            kind: 'CONTENT',
            time: '07:00',
            position: 0,
            isActive: true,
            iconPresentation: null,
          },
        ],
      },
    });
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        title: 'Already planned',
        status: 'SCHEDULED',
        publicationSlotId: 'morning',
        scheduledAt: new Date('2026-10-24T07:00:00.000Z'),
        publishedAt: null,
      },
    ]);
    const rows = await service.occurrences('user-1', 'channel-1', {
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-10-27T00:00:00.000Z',
    });
    expect(rows).toEqual([
      expect.objectContaining({
        slotId: 'morning',
        scheduledAt: '2026-10-24T07:00:00.000Z',
        state: 'OCCUPIED',
        postTitle: 'Already planned',
      }),
      expect.objectContaining({
        slotId: 'morning',
        scheduledAt: '2026-10-25T07:00:00.000Z',
      }),
      expect.objectContaining({
        slotId: 'morning',
        scheduledAt: '2026-10-26T07:00:00.000Z',
      }),
    ]);
  });

  it('batches occurrences, isolates channel reservations, and preserves empty channel entries', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1' },
      { id: 'channel-2' },
      { id: 'channel-3' },
    ]);
    prisma.workspace.findUnique.mockResolvedValue({
      timezone: 'Europe/Warsaw',
    });
    const slot = {
      id: 'ad-1',
      title: 'Ads',
      kind: 'AD',
      time: '07:00',
      isActive: true,
    };
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue(
      [
        {
          channelId: 'channel-1',
          selectionMode: 'FULL',
          selectedSlots: [],
          schedule: { slots: [slot] },
        },
        {
          channelId: 'channel-2',
          selectionMode: 'SUBSET',
          selectedSlots: [{ slotId: 'ad-1' }],
          schedule: { slots: [slot] },
        },
      ],
    );
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: 'Booked',
        telegramChannelId: 'channel-1',
        publicationSlotId: 'ad-1',
        scheduledAt: new Date('2026-10-24T07:00:00.000Z'),
        publishedAt: null,
      },
    ]);

    const rows = await service.occurrencesByChannels('user-1', {
      channelIds: 'channel-1,channel-2,channel-3',
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-10-26T00:00:00.000Z',
    });
    expect(rows['channel-1']).toEqual([
      expect.objectContaining({
        scheduledAt: '2026-10-24T07:00:00.000Z',
        state: 'OCCUPIED',
        postId: 'post-1',
      }),
      expect.objectContaining({ scheduledAt: '2026-10-25T07:00:00.000Z' }),
    ]);
    expect(rows['channel-2']).toHaveLength(2);
    expect(rows['channel-2']?.[0]?.postId).toBeNull();
    expect(rows['channel-3']).toEqual([]);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: { in: ['channel-1', 'channel-2', 'channel-3'] },
        }),
      }),
    );
  });

  it('marks a slot occupied by a legacy/custom publication at the same time', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([{ id: 'channel-1' }]);
    prisma.workspace.findUnique.mockResolvedValue({
      timezone: 'Europe/Warsaw',
    });
    const slot = {
      id: 'ad-1',
      title: 'Ads',
      kind: 'AD',
      time: '07:10',
      isActive: true,
    };
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue(
      [
        {
          channelId: 'channel-1',
          selectionMode: 'FULL',
          selectedSlots: [],
          schedule: { slots: [slot] },
        },
      ],
    );
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      {
        id: 'legacy-post',
        title: 'Scheduled without a slot',
        telegramChannelId: 'channel-1',
        publicationSlotId: null,
        scheduledAt: new Date('2026-10-24T07:10:00.000Z'),
        publishedAt: null,
      },
    ]);

    const rows = await service.occurrencesByChannels('user-1', {
      channelIds: 'channel-1',
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-10-25T00:00:00.000Z',
    });

    expect(rows['channel-1']).toEqual([
      expect.objectContaining({
        time: '09:10',
        state: 'OCCUPIED',
        postId: 'legacy-post',
      }),
    ]);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          publicationSlotId: expect.anything(),
        }),
      }),
    );
  });

  it('includes booked ads with their advertiser avatar, even when they have a managed post', async () => {
    const occurrencesSpy = jest.spyOn(service, 'occurrencesByChannels');
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue(
      [{ channelId: 'channel-1', selectionMode: 'FULL', selectedSlots: [] }],
    );
    prisma.telegramPublicationSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      workspace: { timezone: 'UTC' },
      slots: [],
    });
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      {
        id: 'placement-1',
        telegramAdSaleId: 'sale-1',
        telegramChannelId: 'channel-1',
        scheduledAt: new Date('2026-10-24T07:10:00.000Z'),
        sale: {
          title: 'Autumn launch',
          advertiserName: 'Advertiser',
          advertiser: {
            avatarIcon: null,
            crmPeers: [{ photoUrl: 'https://example.com/avatar.jpg' }],
          },
        },
      },
    ]);

    const calendar = await service.calendar('user-1', {
      scheduleId: 'schedule-1',
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-10-25T00:00:00.000Z',
    });
    expect(calendar.events).toEqual([
      expect.objectContaining({
        kind: 'AD',
        adSaleId: 'sale-1',
        avatarUrl: 'https://example.com/avatar.jpg',
      }),
    ]);
    expect(prisma.telegramAdSalePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ managedPostId: null }),
      }),
    );
    expect(occurrencesSpy).not.toHaveBeenCalled();
    occurrencesSpy.mockRestore();
  });

  it('uses the future per-publisher VP placement instead of the plan anchor date', async () => {
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue(
      [{ channelId: 'channel-1', selectionMode: 'FULL', selectedSlots: [] }],
    );
    prisma.telegramPublicationSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      workspace: { timezone: 'UTC' },
      slots: [],
    });
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.crossPromotionPlan.findMany.mockResolvedValue([
      {
        id: 'vp-1',
        title: 'OVP: October partner post',
        advertiser: {
          avatarIcon: null,
          crmPeers: [{ photoUrl: 'https://example.com/partner.jpg' }],
        },
        scheduledAt: new Date('2026-10-02T10:00:00.000Z'),
        publisherChannelIds: ['channel-1'],
        publicationPost: {
          publisherPublications: [
            {
              placements: [
                {
                  telegramChannelId: 'channel-1',
                  scheduledAt: '2026-10-04T15:10:00.000Z',
                },
              ],
            },
          ],
        },
      },
    ]);
    prisma.icon.findMany.mockResolvedValue([]);

    const calendar = await service.calendar('user-1', {
      scheduleId: 'schedule-1',
      from: '2026-10-03T00:00:00.000Z',
      to: '2026-10-05T00:00:00.000Z',
    });
    expect(calendar.events).toEqual([
      expect.objectContaining({
        kind: 'VP',
        title: 'OVP: October partner post',
        scheduledAt: '2026-10-04T15:10:00.000Z',
        avatarUrl: 'https://example.com/partner.jpg',
      }),
    ]);
  });

  it('shows a VP publication once at its earliest channel delivery', async () => {
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue(
      [
        { channelId: 'channel-1', selectionMode: 'FULL', selectedSlots: [] },
        { channelId: 'channel-2', selectionMode: 'FULL', selectedSlots: [] },
      ],
    );
    prisma.telegramPublicationSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      workspace: { timezone: 'UTC' },
      slots: [],
    });
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.crossPromotionPlan.findMany.mockResolvedValue([
      {
        id: 'vp-1',
        title: 'Admin Hub',
        advertiser: { avatarIcon: null, crmPeers: [] },
        scheduledAt: new Date('2026-10-29T18:10:00.000Z'),
        publisherChannelIds: ['channel-1', 'channel-2'],
        publicationPost: {
          publisherPublications: [
            {
              id: 'publisher-post-1',
              placements: [
                {
                  telegramChannelId: 'channel-1',
                  scheduledAt: '2026-10-29T18:10:00.000Z',
                },
                {
                  telegramChannelId: 'channel-2',
                  scheduledAt: '2026-10-29T20:00:00.000Z',
                },
              ],
            },
          ],
        },
      },
    ]);
    prisma.icon.findMany.mockResolvedValue([]);

    const calendar = await service.calendar('user-1', {
      scheduleId: 'schedule-1',
      from: '2026-10-29T00:00:00.000Z',
      to: '2026-10-30T00:00:00.000Z',
    });
    expect(calendar.events).toEqual([
      expect.objectContaining({
        kind: 'VP',
        title: 'Admin Hub',
        scheduledAt: '2026-10-29T18:10:00.000Z',
      }),
    ]);
  });

  it('rejects inaccessible channels before loading schedule data', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([{ id: 'channel-1' }]);
    await expect(
      service.occurrencesByChannels('user-1', {
        channelIds: 'channel-1,other-workspace-channel',
        from: '2026-10-24T00:00:00.000Z',
        to: '2026-10-25T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      prisma.telegramChannelPublicationScheduleAssignment.findMany,
    ).not.toHaveBeenCalled();
  });

  it('rejects oversized channel lists and date ranges without database work', async () => {
    const range = {
      from: '2026-10-24T00:00:00.000Z',
      to: '2026-12-26T00:00:00.000Z',
    };
    await expect(
      service.occurrencesByChannels('user-1', {
        channelIds: 'channel-1',
        ...range,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.occurrencesByChannels('user-1', {
        channelIds: Array.from({ length: 101 }, (_, i) => `c-${i}`).join(','),
        from: range.from,
        to: '2026-10-25T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });
});
