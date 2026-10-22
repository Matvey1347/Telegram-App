import { CrossPromotionPlanBotNotificationService } from './cross-promotion-plan-bot-notification.service';

describe('CrossPromotionPlanBotNotificationService', () => {
  it('groups scheduled channels by post and links each channel through its public link', async () => {
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new CrossPromotionPlanBotNotificationService(
      {
        crossPromotionPlan: {
          findFirst: jest.fn().mockResolvedValue({
            title: 'ВП <тест>',
            workspace: { timezone: 'Europe/Kyiv' },
            partnerChannelIds: ['partner'],
            publisherChannelIds: ['channel'],
            publicationPost: {
              publisherPublications: [
                {
                  id: 'post-1',
                  post: { title: 'Перший пост' },
                  placements: [{
                    telegramChannelId: 'channel',
                    scheduledAt: '2026-09-29T08:00:00.000Z',
                    deleteAt: '2026-10-01T08:00:00.000Z',
                  }],
                },
                {
                  id: 'post-2',
                  post: { title: 'Другий пост' },
                  placements: [{
                    telegramChannelId: 'fallback-channel',
                    scheduledAt: '2026-09-29T09:00:00.000Z',
                    deleteAt: '2026-09-29T09:30:00.000Z',
                  }],
                },
              ],
            },
          }),
        },
        telegramChannel: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'channel', title: 'Жіноча сила', publicInviteLink: { url: 'https://t.me/women_power' }, presentationIcon: { emoji: '🍃' } },
            { id: 'fallback-channel', title: '💝 Листівки 💝', publicInviteLink: null, defaultInviteLink: { url: 'https://t.me/cards' }, presentationIcon: { emoji: '💌' } },
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
    expect(text).toContain('<b>Пост «Перший пост»:</b>');
    expect(text).toContain('<b>Пост «Другий пост»:</b>');
    expect(text).toContain('<a href="https://t.me/women_power">🍃 <b>Жіноча сила</b></a>');
    expect(text).toContain('<a href="https://t.me/cards">💌 <b>Листівки</b></a>');
    expect(text).not.toContain('💝 Листівки');
    expect(text).toContain('через 48 год');
    expect(text).not.toContain('48 год 0 хв');
    expect(text).not.toContain('Канали партнера');
    expect(text).not.toContain('ВП &lt;тест&gt;');
    expect(text).toContain('https://t.me/women_power');
  });

  it('includes the published post link and its saved post title', async () => {
    const notifications = { sendToWorkspaceUser: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    const service = new CrossPromotionPlanBotNotificationService(
      {
        telegramChannel: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'channel', title: 'Жіноча сила', publicInviteLink: { url: 'https://t.me/women_power' }, defaultInviteLink: null, presentationIcon: { emoji: '🍃' } },
          ]),
        },
        workspace: {
          findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Kyiv' }),
        },
      } as never,
      {} as never,
      notifications as never,
    );

    await service.sendPublicationConfirmation({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      title: 'ВП',
      publicationPost: {
        publisherPublications: [{
          id: 'post-1',
          post: { title: 'Опублікований креатив' },
          placements: [],
        }],
      },
      posts: [{
        telegramChannelId: 'channel',
        publicationId: 'post-1',
        scheduledAt: '2026-09-29T08:00:00.000Z',
        publishedAt: '2026-09-29T08:00:00.000Z',
        deleteAt: '2026-10-01T08:00:00.000Z',
        telegramMessageUrls: ['https://t.me/women_power/123'],
      }],
    });

    const text = notifications.sendToWorkspaceUser.mock.calls[0][0].text;
    expect(text).toContain('<b>Пост «Опублікований креатив»:</b>');
    expect(text).toContain('— <a href="https://t.me/women_power/123">Пост</a>');
    expect(text).toContain('через 48 год');
  });

  it('previews the published confirmation when every managed post is already published', async () => {
    const service = new CrossPromotionPlanBotNotificationService(
      {
        crossPromotionPlan: {
          findFirst: jest.fn().mockResolvedValue({
            title: 'ВП',
            workspace: { timezone: 'Europe/Kyiv' },
            placementPostIds: [
              { telegramChannelId: 'channel', managedPostId: 'managed-1' },
            ],
            publicationPost: {
              publisherPublications: [{
                id: 'post-1',
                post: { title: 'Готовий пост' },
                placements: [{
                  telegramChannelId: 'channel',
                  scheduledAt: '2026-09-29T08:00:00.000Z',
                  deleteAt: '2026-10-01T08:00:00.000Z',
                }],
              }],
            },
          }),
        },
        telegramChannel: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'channel', title: '🍃 Жіноча сила 🍃', publicInviteLink: { url: 'https://t.me/women_power' }, defaultInviteLink: null, presentationIcon: { emoji: '💌' } },
          ]),
        },
        telegramManagedPost: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'managed-1',
              status: 'PUBLISHED',
              publishedAt: new Date('2026-09-29T08:00:00.000Z'),
              telegramChannelId: 'channel',
              telegramMessageUrls: ['https://t.me/women_power/123'],
            },
          ]),
        },
      } as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
      {} as never,
    );

    const preview = await service.preview('user-1', 'plan-1');

    expect(preview.text).toContain('✅ <b>Пости опубліковано</b>');
    expect(preview.text).toContain('<b>Пост «Готовий пост»:</b>');
    expect(preview.text).toContain('— <a href="https://t.me/women_power/123">Пост</a>');
    expect(preview.text).toContain('💌 <b>Жіноча сила</b>');
  });
});
