import { OperationsNotificationDueService } from './operations-notification-due.service';

describe('OperationsNotificationDueService', () => {
  it('re-resolves due recipients before current permission checks and publication', async () => {
    const memberCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const member = (id: string) => ({
      id,
      workspaceId: 'workspace-1',
      userId: `user-${id}`,
      role: 'owner',
      createdAt: memberCreatedAt,
      roleDefinition: null,
    });
    const fact = (recipientMemberId: string) => ({
      id: 'notification-1',
      workspaceId: 'workspace-1',
      type: 'CRM_FOLLOW_UP_DUE',
      recipientMemberId,
      requiredPermissionKey: 'adSales.crm.view',
      ownPermissionKey: 'adSales.crm.viewOwn',
      anyPermissionKey: 'adSales.crm.viewAny',
      visibilityMemberId: recipientMemberId,
      visibilityResourceKey: 'crm-contact:contact-1',
      recipient: member(recipientMemberId),
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
      operationsNotification: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([fact('member-old')])
          .mockResolvedValueOnce([fact('member-current')]),
        deleteMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work) => work(tx)),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const permissions = { canAccess: jest.fn().mockReturnValue(true) };
    const publisher = { publish: jest.fn() };
    const resolution = { resolve: jest.fn().mockResolvedValue(true) };
    const service = new OperationsNotificationDueService(
      prisma as never,
      permissions as never,
      publisher as never,
      resolution as never,
    );

    await expect(service.processDueBatch()).resolves.toEqual({
      published: 1,
      expired: 0,
    });
    expect(resolution.resolve).toHaveBeenCalledWith(tx, [fact('member-old')]);
    expect(permissions.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'member-current' }),
      expect.objectContaining({ recipientMemberId: 'member-current' }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(['notification-1'], {
      wakeRetention: false,
    });
  });
});
