import { TelegramManagedPostStatus } from '@prisma/client';
import { scheduledTaskWakeNotifier } from '../../../common/scheduled-task-wake-notifier';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostPublisherService } from './telegram-managed-post-publisher.service';

describe('TelegramManagedPostPublicationService failure persistence', () => {
  it('makes a publisher preflight failure visible and retryable', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const publisher = {
      publishManagedPost: jest
        .fn()
        .mockRejectedValue(new Error('Production bot cannot post')),
    };
    const service = new TelegramManagedPostPublicationService(
      { telegramManagedPost: { updateMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publisher as never,
    );

    await expect(
      service.publishManagedPost('workspace-1', 'channel-1', 'post-1'),
    ).rejects.toThrow('Production bot cannot post');
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'post-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        OR: expect.arrayContaining([
          { status: TelegramManagedPostStatus.PUBLISHING },
        ]),
      }),
      data: {
        status: TelegramManagedPostStatus.FAILED,
        lastError: 'Production bot cannot post',
      },
    });
  });

  it('wakes ad-sale reconciliation after a linked post is published', () => {
    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      const publisher = Object.create(
        TelegramManagedPostPublisherService.prototype,
      ) as TelegramManagedPostPublisherService;
      publisher.notifyManagedPostSchedulePersisted({}, undefined, true);
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }

    expect(wake).toHaveBeenCalledWith('telegram_ad_sales.due_deletions');
  });
});
