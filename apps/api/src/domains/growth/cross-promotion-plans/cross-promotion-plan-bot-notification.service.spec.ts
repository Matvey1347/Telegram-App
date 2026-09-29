import { CrossPromotionPlanBotNotificationService } from './cross-promotion-plan-bot-notification.service';

describe('CrossPromotionPlanBotNotificationService', () => {
  it('sends a Ukrainian schedule summary with channel emoji and deletion time', async () => {
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new CrossPromotionPlanBotNotificationService(
      {
        crossPromotionPlan: {
          findFirst: jest.fn().mockResolvedValue({
            title: 'ВП <тест>',
            partnerChannelIds: ['partner'],
            publisherChannelIds: ['channel'],
            publicationPost: {
              publisherPlacements: [{
                telegramChannelId: 'channel',
                scheduledAt: '2026-09-29T08:00:00.000Z',
                deleteAt: '2026-10-01T08:00:00.000Z',
              }],
            },
          }),
        },
        telegramChannel: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'partner', title: 'Мій дім', presentationIcon: { emoji: '🏠' } },
            { id: 'channel', title: 'Жіноча сила', presentationIcon: { emoji: '🍃' } },
          ]),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
      notifications as never,
    );

    await service.send('user-1', 'plan-1');

    expect(notifications.sendToWorkspaceUser).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1', userId: 'user-1', parseMode: 'HTML',
        text: expect.stringContaining('✅ <b>Пост заплановано</b>'),
      }),
    );
    const text = notifications.sendToWorkspaceUser.mock.calls[0][0].text;
    expect(text).toContain('🏠 Мій дім');
    expect(text).toContain('🍃 <b>Жіноча сила</b>');
    expect(text).toContain('через 48 год 0 хв');
    expect(text).toContain('ВП &lt;тест&gt;');
  });
});
