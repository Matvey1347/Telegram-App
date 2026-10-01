import { MutualPromotionBotNotificationService } from './mutual-promotion-bot-notification.service';

const channel = {
  id: 'channel-1',
  title: '🧪 Test',
  presentationIcon: { emoji: '🧪' },
  publicInviteLink: { url: 'https://t.me/test_channel' },
  defaultInviteLink: null,
};

describe('MutualPromotionBotNotificationService', () => {
  it('sends a single scheduled confirmation only after every VP delivery is scheduled', async () => {
    const prisma = {
      mutualPromotionFolder: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'folder-1', workspaceId: 'workspace-1', createdByUserId: 'user-1',
          scheduledBotConfirmationSentAt: null,
          participants: [{ telegramChannel: channel }],
          posts: [{ title: 'VP post', deliveries: [{ telegramChannelId: 'channel-1', managedPost: { status: 'SCHEDULED', scheduledAt: new Date('2026-10-01T10:00:00Z'), deleteAt: new Date('2026-10-03T10:00:00Z'), telegramMessageUrls: [] } }] }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolderPost: { findUnique: jest.fn() },
    };
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new MutualPromotionBotNotificationService(prisma as never, notifications as never);

    await service.sendScheduledOnce('folder-1');

    expect(notifications.sendToWorkspaceUser).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', userId: 'user-1', parseMode: 'HTML', text: expect.stringContaining('Пост заплановано') }));
    expect(prisma.mutualPromotionFolder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'folder-1', scheduledBotConfirmationSentAt: null } }));
  });

  it('waits for every published VP delivery to have a Telegram link', async () => {
    const prisma = {
      mutualPromotionFolderPost: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'post-1', publishedBotConfirmationSentAt: null,
          folder: { workspaceId: 'workspace-1', createdByUserId: 'user-1' },
          deliveries: [{ status: 'PUBLISHED', telegramChannelId: 'channel-1', managedPost: { title: 'VP post', scheduledAt: new Date('2026-10-01T10:00:00Z'), deleteAt: null, telegramMessageUrls: ['https://t.me/test_channel/42'] } }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'folder-1', workspaceId: 'workspace-1', createdByUserId: 'user-1', scheduledBotConfirmationSentAt: null,
          participants: [{ telegramChannel: channel }],
          posts: [{ title: 'VP post', deliveries: [{ telegramChannelId: 'channel-1', managedPost: { status: 'PUBLISHED', scheduledAt: new Date('2026-10-01T10:00:00Z'), deleteAt: null, telegramMessageUrls: ['https://t.me/test_channel/42'] } }] }],
        }),
      },
    };
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new MutualPromotionBotNotificationService(prisma as never, notifications as never);

    await service.sendPublishedOnce('post-1');

    expect(notifications.sendToWorkspaceUser).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('https://t.me/test_channel/42') }));
    expect(prisma.mutualPromotionFolderPost.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'post-1', publishedBotConfirmationSentAt: null } }));
  });
});
