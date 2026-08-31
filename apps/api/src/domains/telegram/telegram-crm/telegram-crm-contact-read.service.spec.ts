import { TelegramCrmContactReadService } from './telegram-crm-contact-read.service';

describe('TelegramCrmContactReadService', () => {
  it('combines workspace isolation with view-own ownership scope', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      telegramAdvertiser: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      authorization as never,
    );

    await service.list('user-1', { page: 1, pageSize: 25 });

    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.view',
    );
    expect(authorization.scope).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    expect(prisma.telegramAdvertiser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          ownerMemberId: 'member-1',
        }),
      }),
    );
  });

  it('does not add an owner constraint for view-all access', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[], 0]),
      telegramAdvertiser: {
        findMany: jest.fn().mockReturnValue('rows'),
        count: jest.fn().mockReturnValue('count'),
      },
    };
    const service = new TelegramCrmContactReadService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
    );

    await service.list('user-1', { page: 1, pageSize: 25 });

    expect(prisma.telegramAdvertiser.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: 'workspace-1',
    });
  });
});
