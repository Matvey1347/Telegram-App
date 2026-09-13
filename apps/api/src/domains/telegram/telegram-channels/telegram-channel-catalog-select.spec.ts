/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma read double and Jest matcher assertions */
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';

describe('TelegramChannelCatalogService.selectOptions', () => {
  it('returns every active channel in one compact owned-channel query', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            title: 'Owned channel',
            username: 'owned',
            telegramChatId: '1',
            photoUrl: null,
            currentSubscribersCount: 100,
            isActive: true,
            adminLinks: [
              {
                id: 'admin-1',
                telegramUserAccountIntegrationId: 'account-1',
              },
            ],
          },
        ]),
      },
    };
    const sourceAccess = {
      publishingCapabilitiesForChannels: jest.fn().mockResolvedValue(new Map()),
    };
    const schemaCompatibility = {
      timePostsByChannelIds: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new TelegramChannelCatalogService(
      prisma as never,
      sourceAccess as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      schemaCompatibility as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.selectOptions('user-1', { owned: true });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          archivedAt: null,
          adminLinks: { some: {} },
        }),
        select: expect.objectContaining({
          currentSubscribersCount: true,
          adminLinks: {
            select: { id: true, telegramUserAccountIntegrationId: true },
          },
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});
