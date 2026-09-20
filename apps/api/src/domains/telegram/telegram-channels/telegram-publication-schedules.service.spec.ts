import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramPublicationSchedulesService } from './telegram-publication-schedules.service';

describe('TelegramPublicationSchedulesService', () => {
  const prisma: any = {
    workspace: { findUnique: jest.fn() },
    telegramChannel: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramChannelPublicationScheduleAssignment: { findMany: jest.fn() },
    telegramPublicationSchedule: { findFirst: jest.fn() },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('creates daily occurrences in the workspace timezone across a DST boundary', async () => {
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
        isDefault: true,
        assignedChannelsCount: 1,
        createdAt: '',
        updatedAt: '',
        slots: [
          {
            id: 'morning',
            scheduleId: 'schedule-1',
            title: 'Morning',
            kind: 'CONTENT',
            time: '09:00',
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
        scheduledAt: '2026-10-25T08:00:00.000Z',
      }),
      expect.objectContaining({
        slotId: 'morning',
        scheduledAt: '2026-10-26T08:00:00.000Z',
      }),
    ]);
  });

  it('batches occurrences, isolates channel reservations, and preserves empty channel entries', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([{ id: 'channel-1' }, { id: 'channel-2' }, { id: 'channel-3' }]);
    prisma.workspace.findUnique.mockResolvedValue({ timezone: 'Europe/Warsaw' });
    const slot = { id: 'ad-1', title: 'Ads', kind: 'AD', time: '09:00', isActive: true };
    prisma.telegramChannelPublicationScheduleAssignment.findMany.mockResolvedValue([
      { channelId: 'channel-1', selectionMode: 'FULL', selectedSlots: [], schedule: { slots: [slot] } },
      { channelId: 'channel-2', selectionMode: 'SUBSET', selectedSlots: [{ slotId: 'ad-1' }], schedule: { slots: [slot] } },
    ]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([{
      id: 'post-1', title: 'Booked', telegramChannelId: 'channel-1', publicationSlotId: 'ad-1',
      scheduledAt: new Date('2026-10-24T07:00:00.000Z'), publishedAt: null,
    }]);

    const rows = await service.occurrencesByChannels('user-1', {
      channelIds: 'channel-1,channel-2,channel-3',
      from: '2026-10-24T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z',
    });
    expect(rows['channel-1']).toEqual([
      expect.objectContaining({ scheduledAt: '2026-10-24T07:00:00.000Z', state: 'OCCUPIED', postId: 'post-1' }),
      expect.objectContaining({ scheduledAt: '2026-10-25T08:00:00.000Z' }),
    ]);
    expect(rows['channel-2']).toHaveLength(2);
    expect(rows['channel-2']?.[0]?.postId).toBeNull();
    expect(rows['channel-3']).toEqual([]);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'workspace-1', telegramChannelId: { in: ['channel-1', 'channel-2', 'channel-3'] } }),
    }));
  });

  it('rejects inaccessible channels before loading schedule data', async () => {
    prisma.telegramChannel.findMany.mockResolvedValue([{ id: 'channel-1' }]);
    await expect(service.occurrencesByChannels('user-1', {
      channelIds: 'channel-1,other-workspace-channel',
      from: '2026-10-24T00:00:00.000Z', to: '2026-10-25T00:00:00.000Z',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannelPublicationScheduleAssignment.findMany).not.toHaveBeenCalled();
  });

  it('rejects oversized channel lists and date ranges without database work', async () => {
    const range = { from: '2026-10-24T00:00:00.000Z', to: '2026-12-26T00:00:00.000Z' };
    await expect(service.occurrencesByChannels('user-1', { channelIds: 'channel-1', ...range })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.occurrencesByChannels('user-1', { channelIds: Array.from({ length: 101 }, (_, i) => `c-${i}`).join(','), from: range.from, to: '2026-10-25T00:00:00.000Z' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });
});
