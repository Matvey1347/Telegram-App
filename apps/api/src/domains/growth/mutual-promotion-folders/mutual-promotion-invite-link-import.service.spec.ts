import { InternalServerErrorException } from '@nestjs/common';
import { MutualPromotionInviteLinkImportService } from './mutual-promotion-invite-link-import.service';

describe('MutualPromotionInviteLinkImportService', () => {
  const option = {
    id: 'link-1',
    telegramChannelId: 'channel-1',
    name: 'Legacy link',
    url: 'https://t.me/+valid',
    available: true,
    creatorMember: {
      id: 'member-1',
      name: 'Owner',
      avatarPresentation: { type: 'unicode', value: '😇' },
    },
  };

  function createService(options = [option]) {
    const registration = {
      register: jest.fn().mockResolvedValue({ id: 'link-1' }),
    };
    const read = {
      inviteLinkOptions: jest.fn().mockResolvedValue(options),
    };
    const prisma = {
      mutualPromotionFolderParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return {
      service: new MutualPromotionInviteLinkImportService(
        registration as never,
        read as never,
        prisma as never,
      ),
      registration,
      read,
      prisma,
    };
  }

  it('returns the persisted option with its resolved creator avatar', async () => {
    const { service, registration, read } = createService();
    const dto = {
      telegramChannelId: 'channel-1',
      url: 'https://t.me/+valid',
      folderId: 'folder-1',
      startsAt: '2026-09-08T08:00:00.000Z',
      endsAt: '2026-09-10T08:00:00.000Z',
    };

    await expect(service.import('user-1', dto)).resolves.toEqual(option);
    expect(registration.register).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      dto.url,
      {
        from: new Date(dto.startsAt),
        until: expect.any(Date),
      },
    );
    expect(read.inviteLinkOptions).toHaveBeenCalledWith('user-1', {
      channelIds: ['channel-1'],
      folderId: 'folder-1',
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    });
  });

  it('restores the selected link boundary from Telegram importer history', async () => {
    const { service, registration, prisma } = createService();
    registration.register.mockResolvedValue({
      id: 'link-1',
      workspaceId: 'workspace-1',
      currentJoinedCount: 86,
      joinedWithinPeriod: 12,
    });

    await service.import('user-1', {
      telegramChannelId: 'channel-1',
      url: 'https://t.me/+valid',
      folderId: 'folder-1',
      startsAt: '2026-09-08T08:00:00.000Z',
      endsAt: '2099-09-10T08:00:00.000Z',
    });

    expect(registration.register).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'https://t.me/+valid',
      {
        from: new Date('2026-09-08T08:00:00.000Z'),
        until: expect.any(Date),
      },
    );
    expect(
      prisma.mutualPromotionFolderParticipant.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        folderId: 'folder-1',
        telegramChannelId: 'channel-1',
        inviteLinkId: 'link-1',
      },
      data: {
        inviteJoinedAtStart: 74,
        baselineCapturedAt: new Date('2026-09-08T08:00:00.000Z'),
        inviteJoinedAtEnd: null,
      },
    });
  });

  it('fails clearly if the saved row cannot be returned', async () => {
    const { service } = createService([]);

    await expect(
      service.import('user-1', {
        telegramChannelId: 'channel-1',
        url: 'https://t.me/+valid',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
