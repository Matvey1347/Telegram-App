import { hydrateTelegramInviteCreatorProfiles } from './telegram-invite-creator-profile';

describe('hydrateTelegramInviteCreatorProfiles', () => {
  it('uses the stored MTProto avatar for an invite creator matched by username', async () => {
    const prisma = {
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramUserId: '42',
            username: 'admin',
            firstName: 'Admin',
            photoUrl: 'data:image/jpeg;base64,avatar',
          },
        ]),
      },
    };

    const [link] = await hydrateTelegramInviteCreatorProfiles(
      prisma as never,
      'workspace-1',
      [
        {
          creatorTelegramUserId: null,
          creatorUsername: 'ADMIN',
          creatorPhotoUrl: null,
        },
      ],
    );

    expect(link.creatorPhotoUrl).toBe('data:image/jpeg;base64,avatar');
  });
});
