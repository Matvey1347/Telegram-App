import { PromosService } from './promos.service';

describe('PromosService.findAll', () => {
  it('excludes heavy content and creator detail from the compact list', async () => {
    type PromoListQuery = {
      where: { workspaceId: string };
      select: Record<string, unknown>;
    };
    let findOperation: PromoListQuery | undefined;
    const findMany = jest.fn((value: PromoListQuery) => {
      findOperation = value;
      return Promise.resolve([]);
    });
    const prisma = {
      promo: {
        findMany,
        count: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const service = new PromosService(
      prisma as never,
      workspaceService as never,
      {} as never,
    );

    await expect(service.findAll('user-1')).resolves.toMatchObject({
      items: [],
      pagination: { totalItems: 0 },
    });

    if (!findOperation) throw new Error('Expected promo list query');
    expect(findOperation.where).toEqual(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        telegramChannel: { workspaceId: 'workspace-1', archivedAt: null },
      }),
    );
    expect(findOperation.select).not.toHaveProperty('text');
    expect(findOperation.select).toHaveProperty('previewText', true);
    expect(findOperation.select).toHaveProperty('previewImageUrl', true);
    expect(findOperation.select).not.toHaveProperty('imageData');
    expect(findOperation.select).not.toHaveProperty('createdByUser');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the compact creative preview and resolved assigned-member avatar', async () => {
    const item = {
      id: 'promo-1',
      previewText: 'Saved creative opening',
      icon: null,
      assignedMember: {
        id: 'member-1',
        avatarIcon: {
          id: 'avatar-1',
          type: 'image',
          name: 'Member avatar',
          imageUrl: 'https://cdn.test/member.jpg',
        },
      },
    };
    const prisma = {
      promo: {
        findMany: jest.fn().mockResolvedValue([item]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new PromosService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
    );

    const result = await service.findAll('user-1');

    expect(result.items[0]).toMatchObject({
      previewText: 'Saved creative opening',
      assignedMember: {
        avatarPresentation: {
          type: 'image',
          id: 'avatar-1',
          url: 'https://cdn.test/member.jpg',
        },
      },
    });
  });

  it('searches compact promo pages by text, status, and channel with one shared predicate', async () => {
    let findWhere: unknown;
    let countWhere: unknown;
    const prisma = {
      promo: {
        findMany: jest.fn((query: { where: unknown }) => {
          findWhere = query.where;
          return Promise.resolve([]);
        }),
        count: jest.fn((query: { where: unknown }) => {
          countWhere = query.where;
          return Promise.resolve(0);
        }),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new PromosService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
    );

    await service.findAll('user-1', { search: 'draft' });

    expect(findWhere).toBe(countWhere);
    expect(JSON.stringify(findWhere)).toContain('"workspaceId":"workspace-1"');
    expect(JSON.stringify(findWhere)).toContain('"text"');
    expect(JSON.stringify(findWhere)).toContain('"status":{"in":["draft"]}');
    expect(JSON.stringify(findWhere)).toContain('"telegramChannel"');
  });

  it('filters promos by every channel selected in the Ads scope', async () => {
    let findWhere: Record<string, unknown> | undefined;
    const prisma = {
      promo: {
        findMany: jest.fn((query: { where: Record<string, unknown> }) => {
          findWhere = query.where;
          return Promise.resolve([]);
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new PromosService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
    );

    await service.findAll('user-1', {
      telegramChannelIds: 'channel-1,channel-2',
    });

    expect(findWhere?.telegramChannelId).toEqual({
      in: ['channel-1', 'channel-2'],
    });
  });
});

describe('PromosService.create', () => {
  it('stores reusable Telegram media, buttons and a channel-owned invite link', async () => {
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
      telegramInviteLink: {
        findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }),
      },
      icon: { findFirst: jest.fn() },
      promo: {
        create: jest.fn().mockResolvedValue({ id: 'promo-1', icon: null }),
      },
    };
    const service = new PromosService(
      prisma as never,
      {
        resolveAssignedMemberId: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          assignedMemberId: 'member-1',
        }),
      } as never,
      {} as never,
    );
    await service.create('user-1', {
      telegramChannelId: 'channel-1',
      title: 'Reusable promo',
      text: 'Join {{invite_link}}',
      imageUrls: ['https://cdn.test/photo.jpg'],
      mediaItems: [{ kind: 'PHOTO', url: 'https://cdn.test/photo.jpg' }],
      buttonRows: [
        [{ text: 'Join', url: '{{invite_link}}', style: 'primary' }],
      ],
      defaultInviteLinkId: 'link-1',
    });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'channel-1',
        workspaceId: 'workspace-1',
        archivedAt: null,
      },
      select: { id: true },
    });
    expect(prisma.telegramInviteLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          id: 'link-1',
        }),
      }),
    );
    expect(prisma.promo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          text: 'Join {{invite_link}}',
          previewText: 'Join {{invite_link}}',
          previewImageUrl: 'https://cdn.test/photo.jpg',
          defaultInviteLinkId: 'link-1',
          mediaItems: [{ kind: 'PHOTO', url: 'https://cdn.test/photo.jpg' }],
        }),
      }),
    );
  });
});

describe('PromosService.findOne', () => {
  it('uses a compact channel relation so unrelated channel schema fields cannot break promo editing', async () => {
    let capturedQuery:
      | {
          select?: { telegramChannel?: unknown };
          include?: unknown;
        }
      | undefined;
    const prisma = {
      promo: {
        findFirst: jest.fn(
          (query: {
            select?: { telegramChannel?: unknown };
            include?: unknown;
          }) => {
            capturedQuery = query;
            return Promise.resolve({
              id: 'promo-1',
              icon: null,
              assignedMember: null,
            });
          },
        ),
      },
    };
    const service = new PromosService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      {} as never,
    );

    await service.findOne('user-1', 'promo-1');

    expect(capturedQuery?.select?.telegramChannel).toEqual({
      select: { id: true, title: true, username: true, photoUrl: true },
    });
    expect(capturedQuery).not.toHaveProperty('include');
  });
});
