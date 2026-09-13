import { TelegramCrmSystemTagsService } from './telegram-crm-system-tags.service';

describe('TelegramCrmSystemTagsService', () => {
  it('creates and assigns network and channel tags for completed purchases', async () => {
    const tagFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'tag-channel', systemKey: 'CHANNEL:channel-1' },
        { id: 'tag-network', systemKey: 'NETWORK:network-1' },
      ]);
    const tagCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const assignmentCreateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannel: {
              id: 'channel-1',
              title: 'Business patterns',
              networkMembers: [],
            },
            network: { id: 'network-1', name: 'Business' },
          },
        ]),
      },
      telegramAdvertiserTag: {
        findMany: tagFindMany,
        createMany: tagCreateMany,
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: assignmentCreateMany,
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags(
      'workspace-1',
      'advertiser-1',
      prisma as never,
    );

    const [tagCreate] = tagCreateMany.mock.calls[0] as unknown as [
      {
        data: Array<{ systemKey: string; name: string }>;
        skipDuplicates: boolean;
      },
    ];
    expect(tagCreate.skipDuplicates).toBe(true);
    expect(tagCreate.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemKey: 'NETWORK:network-1',
          name: 'Network · Business',
        }),
        expect.objectContaining({
          systemKey: 'CHANNEL:channel-1',
          name: 'Channel · Business patterns',
        }),
      ]),
    );
    const [assignmentCreate] = assignmentCreateMany.mock
      .calls[0] as unknown as [
      {
        data: Array<{
          advertiserId: string;
          tagId: string;
          workspaceId: string;
        }>;
        skipDuplicates: boolean;
      },
    ];
    expect(assignmentCreate.skipDuplicates).toBe(true);
    expect(assignmentCreate.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          advertiserId: 'advertiser-1',
          tagId: 'tag-channel',
          workspaceId: 'workspace-1',
        }),
      ]),
    );
  });

  it('does not write tags when the advertiser has no qualifying purchase', async () => {
    const prisma = {
      telegramAdSalePlacement: { findMany: jest.fn().mockResolvedValue([]) },
      telegramAdvertiserTag: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(prisma.telegramAdvertiserTag.createMany).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('removes stale purchase tags after the last qualifying sale is cancelled', async () => {
    const prisma = {
      telegramAdSalePlacement: { findMany: jest.fn().mockResolvedValue([]) },
      telegramAdvertiserTag: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            tagId: 'tag-network',
            tag: { systemKey: 'NETWORK:network-1' },
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        advertiserId: 'advertiser-1',
        tagId: { in: ['tag-network'] },
      },
    });
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
  });

  it('does not rewrite assignments that are already current', async () => {
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannel: {
              id: 'channel-1',
              title: 'Business patterns',
              networkMembers: [],
            },
            network: null,
          },
        ]),
      },
      telegramAdvertiserTag: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'tag-channel',
              systemKey: 'CHANNEL:channel-1',
              name: 'Channel · Business patterns',
            },
          ])
          .mockResolvedValueOnce([{ id: 'tag-channel' }]),
        createMany: jest.fn(),
      },
      telegramAdvertiserTagAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            tagId: 'tag-channel',
            tag: { systemKey: 'CHANNEL:channel-1' },
          },
        ]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const service = new TelegramCrmSystemTagsService(prisma as never);

    await service.syncPurchasedTags('workspace-1', 'advertiser-1');

    expect(prisma.telegramAdvertiserTag.createMany).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.createMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.telegramAdvertiserTagAssignment.deleteMany,
    ).not.toHaveBeenCalled();
  });
});
