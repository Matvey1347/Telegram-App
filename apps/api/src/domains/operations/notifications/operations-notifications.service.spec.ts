import { OperationsNotificationsService } from './operations-notifications.service';

describe('OperationsNotificationsService', () => {
  function setup() {
    const access = {
      workspaceId: 'workspace-1',
      memberId: 'member-1',
      permissionKeys: new Set([
        'operations.notifications',
        'adSales.crm.view',
        'adSales.crm.viewOwn',
      ]),
    };
    const prisma: any = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
      operationsNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
      operationsNotificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      operationsPushSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (work: (tx: unknown) => unknown) => work(prisma),
    );
    const authorization = { require: jest.fn().mockResolvedValue(access) };
    const pushConfig = {
      get: () => ({ enabled: false }),
      publicConfig: jest.fn(),
    };
    const permissions = {
      visibilityWhere: jest.fn().mockReturnValue({ AND: [] }),
    };
    return {
      access,
      prisma,
      service: new OperationsNotificationsService(
        prisma as never,
        authorization as never,
        pushConfig as never,
        permissions as never,
      ),
    };
  }

  it('scopes recipient reads to the current workspace/member and stored permissions', async () => {
    const { service, prisma } = setup();
    await service.list('user-1', { limit: '50' });
    expect(prisma.operationsNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          recipientMemberId: 'member-1',
          AND: expect.any(Array),
        }),
        take: 51,
      }),
    );
  });

  it('does not write an absent preference when requested value is already false', async () => {
    const { service, prisma } = setup();
    await expect(service.updatePreferences('user-1', false)).resolves.toEqual({
      webPushEnabled: false,
      pushConfigured: false,
      activeSubscriptionCount: 0,
    });
    expect(
      prisma.operationsNotificationPreference.upsert,
    ).not.toHaveBeenCalled();
    expect(
      prisma.operationsNotificationPreference.update,
    ).not.toHaveBeenCalled();
  });

  it('does not rewrite an unchanged active User subscription', async () => {
    const { service, prisma } = setup();
    prisma.operationsPushSubscription.findUnique.mockResolvedValue({
      userId: 'user-1',
      p256dh: 'key',
      auth: 'auth',
      userAgent: null,
      active: true,
    });
    await service.subscribe('user-1', {
      endpoint: 'https://push.example/device',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    expect(prisma.operationsPushSubscription.create).not.toHaveBeenCalled();
    expect(prisma.operationsPushSubscription.update).not.toHaveBeenCalled();
  });

  it('rejects a sixth active push device for one User', async () => {
    const { service, prisma } = setup();
    prisma.operationsPushSubscription.count.mockResolvedValue(5);
    await expect(
      service.subscribe('user-1', {
        endpoint: 'https://push.example/device-6',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    ).rejects.toThrow('at most 5 active push devices');
    expect(prisma.operationsPushSubscription.create).not.toHaveBeenCalled();
  });

  it('serializes device-cap checks with a transaction-scoped User lock', async () => {
    const { service, prisma } = setup();
    await service.subscribe('user-1', {
      endpoint: 'https://push.example/device-new',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.operationsPushSubscription.create).toHaveBeenCalled();
  });

  it('bounds visible-ID writes to 50 and retains workspace ownership', async () => {
    const { service, prisma } = setup();
    await service.markVisible(
      'user-1',
      Array.from({ length: 75 }, (_, index) => `notification-${index}`),
    );
    const call = prisma.operationsNotification.updateMany.mock.calls[0][0];
    expect(call.where.id.in).toHaveLength(50);
    expect(call.where).toMatchObject({
      workspaceId: 'workspace-1',
      recipientMemberId: 'member-1',
    });
  });
});
