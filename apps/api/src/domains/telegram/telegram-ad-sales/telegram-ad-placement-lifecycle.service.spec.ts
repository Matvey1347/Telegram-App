/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { TelegramAdPlacementStatus } from '@prisma/client';
import { scheduledTaskWakeNotifier } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { TelegramAdPlacementLifecycleService } from './telegram-ad-placement-lifecycle.service';

describe('TelegramAdPlacementLifecycleService', () => {
  it('notifies the due scheduler after persisted placement lifecycle changes', async () => {
    const publishedAt = new Date('2026-08-19T08:00:00.000Z');
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'placement-1',
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            status: TelegramAdPlacementStatus.SCHEDULED,
            telegramPostId: null,
            deleteAfterHoursSnapshot: 24,
            isPermanentSnapshot: false,
            managedPost: {
              publishedAt,
              telegramMessageIds: ['42'],
            },
          },
        ]),
        update,
      },
      telegramPost: {
        findFirst: jest.fn().mockResolvedValue({ id: 'telegram-post-1' }),
      },
    };
    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      const service = new TelegramAdPlacementLifecycleService(prisma as never);

      await expect(service.reconcilePublishedPlacements()).resolves.toEqual({
        reconciled: 1,
      });
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramAdPlacementStatus.PUBLISHED,
          plannedDeleteAt: new Date('2026-08-20T08:10:00.000Z'),
        }),
      }),
    );
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith('telegram_ad_sales.due_deletions');
  });
});
