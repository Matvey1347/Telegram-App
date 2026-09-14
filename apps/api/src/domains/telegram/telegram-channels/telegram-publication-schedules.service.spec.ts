import { BadRequestException } from '@nestjs/common';
import { TelegramPublicationSchedulesService } from './telegram-publication-schedules.service';

describe('TelegramPublicationSchedulesService', () => {
  const prisma: any = {
    telegramChannel: { findFirst: jest.fn() },
    telegramPublicationSchedule: { findFirst: jest.fn() },
  };
  const workspace: any = { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') };
  const service = new TelegramPublicationSchedulesService(prisma, workspace);

  beforeEach(() => jest.clearAllMocks());

  it('rejects SUBSET assignments without selected slots', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
    prisma.telegramPublicationSchedule.findFirst.mockResolvedValue({ id: 'schedule-1', slots: [{ id: 'slot-1' }] });
    await expect(service.assign('user-1', 'channel-1', { scheduleId: 'schedule-1', selectionMode: 'SUBSET', selectedSlotIds: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates Monday and Sunday occurrences across the Europe/Warsaw DST boundary', async () => {
    jest.spyOn(service, 'assignment').mockResolvedValue({
      id: 'assignment-1', channelId: 'channel-1', scheduleId: 'schedule-1', selectionMode: 'FULL', selectedSlotIds: [], updatedAt: '',
      schedule: { id: 'schedule-1', name: 'Main', timezone: 'Europe/Warsaw', isDefault: true, assignedChannelsCount: 1, createdAt: '', updatedAt: '', slots: [
        { id: 'sun', scheduleId: 'schedule-1', title: 'Sunday', kind: 'CONTENT', weekday: 7, time: '09:00', timezone: 'Europe/Warsaw', position: 0, isActive: true, iconPresentation: null },
        { id: 'mon', scheduleId: 'schedule-1', title: 'Monday', kind: 'AD', weekday: 1, time: '09:00', timezone: 'Europe/Warsaw', position: 1, isActive: true, iconPresentation: null },
      ] },
    });
    const rows = await service.occurrences('user-1', 'channel-1', { from: '2026-10-24T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z' });
    expect(rows).toEqual([
      expect.objectContaining({ slotId: 'sun', scheduledAt: '2026-10-25T08:00:00.000Z' }),
      expect.objectContaining({ slotId: 'mon', scheduledAt: '2026-10-26T08:00:00.000Z' }),
    ]);
  });
});
