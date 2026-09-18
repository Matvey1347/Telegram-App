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

describe('TelegramChannelCatalogService.findAll', () => {
  it('returns schedule completion in the existing channel-card read model', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            title: 'Scheduled channel',
            currentSubscribersCount: 100,
            activeSubscribersWindow: 10,
            pendingJoinRequestsCount: 0,
            adminLinks: [],
            sourceAccesses: [],
            audienceSnapshots: [],
            adAnalyses: [],
            _count: { adAnalyses: 0 },
            presentationIcon: null,
            publicationScheduleAssignment: { id: 'assignment-1' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new TelegramChannelCatalogService(
      prisma as never,
      {} as never,
      { workspace: jest.fn().mockResolvedValue('workspace-1') } as never,
      {
        timePostsByChannelIds: jest.fn().mockResolvedValue(new Map()),
        isMissingTelegramChannelSyncScopeColumn: jest
          .fn()
          .mockReturnValue(false),
      } as never,
      {
        buildChannelFinancialSummaryPreview: jest
          .fn()
          .mockResolvedValue(new Map()),
      } as never,
      { summariesForChannels: jest.fn().mockResolvedValue(new Map()) } as never,
      { summariesForChannels: jest.fn().mockResolvedValue(new Map()) } as never,
      { summariesForChannels: jest.fn().mockResolvedValue(new Map()) } as never,
      { productionUsername: null } as never,
    );

    const result = await service.findAll('user-1');

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          publicationScheduleAssignment: { select: { id: true } },
        }),
      }),
    );
    expect(
      (result.items[0] as { preview: { hasPublicationSchedule: boolean } })
        ?.preview.hasPublicationSchedule,
    ).toBe(true);
    expect(result.items[0]).not.toHaveProperty('publicationScheduleAssignment');
  });
});
