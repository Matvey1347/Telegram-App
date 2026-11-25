import { TelegramChannelRemindersService } from './telegram-channel-reminders.service';

const destinations = {
  coverageDestination: 'TELEGRAM_GROUP',
  autopilotDestination: 'TELEGRAM_GROUP',
  autopilotErrorDestination: 'TELEGRAM_GROUP',
  scheduledConfirmationDestination: 'TELEGRAM_PRIVATE',
  publishedConfirmationDestination: 'TELEGRAM_PRIVATE',
} as const;

describe('publication notification settings', () => {
  function setup() {
    const prisma = {
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          coverageNotificationDestination: destinations.coverageDestination,
          autopilotNotificationDestination: destinations.autopilotDestination,
          autopilotErrorNotificationDestination:
            destinations.autopilotErrorDestination,
          scheduledConfirmationDestination: destinations.scheduledConfirmationDestination,
          publishedConfirmationDestination: destinations.publishedConfirmationDestination,
          timezone: 'Europe/Kyiv',
          publicationNotificationsEnabled: false,
          publicationNotificationExcludedChannelIds: [],
        }),
        update: jest.fn(),
      },
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'one', title: '💌 One 💌' },
          { id: 'two', title: 'Two' },
        ]),
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'one',
            title: '💌 One 💌',
            username: 'one',
            avatarEmojiIcon: { id: 'icon', type: 'emoji', emoji: '![💌](tg://emoji?id=42)' },
          }),
      },
    };
    const workspace = {
      requireWorkspaceRole: jest
        .fn()
        .mockResolvedValue({ workspaceId: 'workspace' }),
    };
    return {
      service: new TelegramChannelRemindersService(
        prisma as never,
        workspace as never,
      ),
      prisma,
      workspace,
    };
  }

  it('starts with every active channel selected and saves exclusions in this workspace', async () => {
    const { service, prisma } = setup();
    const settings = await service.settings('user');
    expect(settings).toMatchObject({
      enabled: false,
      excludedChannelIds: [],
      channels: [{ title: 'One' }, { title: 'Two' }],
    });
    expect(
      await service.save('user', {
        ...destinations,
        enabled: true,
        excludedChannelIds: ['two'],
      }),
    ).toMatchObject({ enabled: true, excludedChannelIds: ['two'] });
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'workspace' },
      data: expect.objectContaining({
        publicationNotificationExcludedChannelIds: ['two'],
        publicationNotificationDueAt: expect.any(Date),
      }),
    });
  });

  it('leaves an unchanged save idle', async () => {
    const { service, prisma } = setup();
    await service.save('user', {
      ...destinations,
      enabled: false,
      excludedChannelIds: [],
    });
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it('changes a report destination without resetting the coverage due time', async () => {
    const { service, prisma } = setup();
    await service.save('user', {
      ...destinations,
      autopilotDestination: 'TELEGRAM_PRIVATE',
      enabled: false,
      excludedChannelIds: [],
    });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autopilotNotificationDestination: 'TELEGRAM_PRIVATE',
        }),
      }),
    );
    expect(prisma.workspace.update.mock.calls[0][0].data).not.toHaveProperty(
      'publicationNotificationDueAt',
    );
  });

  it('rejects an exclusion or preview belonging to another workspace', async () => {
    const { service, prisma } = setup();
    await expect(
      service.save('user', {
        ...destinations,
        enabled: true,
        excludedChannelIds: ['foreign'],
      }),
    ).rejects.toThrow('unavailable');
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    prisma.telegramChannel.findFirst.mockResolvedValueOnce(null);
    await expect(service.preview('user', 'foreign')).rejects.toThrow(
      'unavailable',
    );
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          id: 'foreign',
        }),
      }),
    );
  });

  it('previews both confirmations with the same linked channel and custom icon as Telegram', async () => {
    const { service, prisma } = setup();
    const preview = await service.preview('user', 'one');
    expect(preview.autopilot[0].text).toBe('One');
    expect(preview.autopilotError.at(-1)?.text).toBe('Ошибки · 6');
    expect(preview.autopilotError.map(({ text }) => text)).toEqual(expect.arrayContaining([
      'Готовые публикации · $0.16', 'Публикации с ошибками · $0.05', 'Всего · $0.22',
    ]));
    expect(preview.coverage[1].text).toBe('One');
    for (const confirmation of [preview.scheduledConfirmation, preview.publishedConfirmation]) {
      expect(confirmation).toContainEqual(expect.objectContaining({
        icon: expect.objectContaining({ telegramCustomEmojiId: '42' }),
        parts: expect.arrayContaining([{ text: 'One', href: 'https://t.me/one', strong: true }]),
      }));
    }
    expect(preview.scheduledConfirmation[0].parts?.[1].text).toBe('Пост заплановано');
    expect(preview.publishedConfirmation[0].parts?.[1].text).toBe('Пости опубліковано');
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });
});
