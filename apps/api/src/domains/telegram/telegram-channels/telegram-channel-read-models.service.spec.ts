import { TelegramChannelReadModelsService } from './telegram-channel-read-models.service';

describe('TelegramChannelReadModelsService', () => {
  it('hydrates invite-link creator avatars in the paginated read model', async () => {
    const attachInviteLinkHistories = jest.fn(
      async (_workspaceId: string, _channelId: string, links: unknown[]) =>
        links,
    );
    const prisma = {
      telegramInviteLink: { count: jest.fn().mockResolvedValue(1) },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramUserId: '42',
            username: 'owner',
            firstName: 'Owner',
            photoUrl: 'https://cdn.test/owner.jpg',
          },
        ]),
      },
    };
    const service = new TelegramChannelReadModelsService(
      prisma as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      {} as never,
      { attachInviteLinkHistories } as never,
      {} as never,
      {
        findInviteLinksWithRequestedCountFallback: jest.fn().mockResolvedValue([
          {
            id: 'link-1',
            creatorTelegramUserId: '42',
            creatorUsername: 'owner',
            creatorPhotoUrl: null,
          },
        ]),
      } as never,
      {
        findOne: jest.fn().mockResolvedValue({ defaultInviteLinkId: 'link-1' }),
      } as never,
    );

    const result = await service.inviteLinks('user-1', 'channel-1');

    expect(attachInviteLinkHistories).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      [
        expect.objectContaining({
          creatorPhotoUrl: 'https://cdn.test/owner.jpg',
        }),
      ],
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        creatorPhotoUrl: 'https://cdn.test/owner.jpg',
        isDefaultForChannel: true,
      }),
    );
  });

  it('loads only the selected/default option without hydrating histories', async () => {
    const attachInviteLinkHistories = jest.fn();
    const findLinks = jest.fn().mockResolvedValue([
      {
        id: 'default-link',
        telegramChannelId: 'channel-1',
        creatorTelegramUserId: null,
      },
    ]);
    const service = new TelegramChannelReadModelsService(
      {
        telegramUserAccountIntegration: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      {} as never,
      { attachInviteLinkHistories } as never,
      {} as never,
      {
        findInviteLinksWithRequestedCountFallback: findLinks,
      } as never,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ defaultInviteLinkId: 'default-link' }),
      } as never,
    );

    const result = await service.inviteLinksForSelect('user-1', 'channel-1', {
      initial: true,
    });

    expect(findLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              workspaceId: 'workspace-1',
              telegramChannelId: 'channel-1',
            }),
            { id: 'default-link' },
          ],
        },
      }),
    );
    expect(attachInviteLinkHistories).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'default-link',
        isDefaultForChannel: true,
      }),
    ]);
  });
});
