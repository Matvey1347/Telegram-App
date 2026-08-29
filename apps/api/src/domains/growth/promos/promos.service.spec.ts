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
      expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
    expect(findOperation.select).not.toHaveProperty('text');
    expect(findOperation.select).not.toHaveProperty('imageData');
    expect(findOperation.select).not.toHaveProperty('createdByUser');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
});
