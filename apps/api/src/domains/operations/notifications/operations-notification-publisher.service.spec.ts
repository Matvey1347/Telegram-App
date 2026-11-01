import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';

const row = {
  id: 'notification-current',
  workspaceId: 'workspace-current',
  recipientMemberId: 'member-current',
  type: 'CRM_MESSAGE_RECEIVED',
  priority: 'NORMAL',
  sourceKey: 'conversation:current',
  copyKey: 'crm.notification.messageReceived',
  title: 'New message',
  body: 'Previously visible private text',
  targetUrl: '/ad-sales/inbox',
  metadata: {},
  publishedAt: new Date(),
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60000),
  readAt: null,
  requiredPermissionKey: 'adSales.crm.view',
  ownPermissionKey: null,
  anyPermissionKey: 'adSales.crm.viewAny',
  visibilityMemberId: null,
  recipient: {
    operationsNotificationPreference: {
      crmNotificationsEnabled: true,
      crmIncomingMessagesEnabled: true,
      crmMessagePreviewEnabled: false,
    },
  },
};

describe('OperationsNotificationPublisherService', () => {
  function setup() {
    const prisma = {
      operationsNotification: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const events = { emit: jest.fn() };
    const push = {
      dispatch: jest.fn().mockResolvedValue({
        attempted: 1,
        delivered: 1,
        failed: 0,
        skipped: 0,
      }),
    };
    const permission = { canAccess: jest.fn().mockReturnValue(true) };
    return {
      prisma,
      events,
      push,
      permission,
      service: new OperationsNotificationPublisherService(
        prisma as never,
        events as never,
        push as never,
        permission as never,
      ),
    };
  }

  it('returns dispatch results and strips stale stored preview before SSE if current preview is disabled', async () => {
    const { service, events, push } = setup();
    expect(await service.publish([row.id], { wakeRetention: false })).toEqual({
      attempted: 1,
      delivered: 1,
      failed: 0,
      skipped: 0,
    });
    const emitted = (events.emit.mock.calls as unknown[][])[0][0];
    expect(emitted).toMatchObject({
      notification: { body: 'Open Inbox to read the new message.' },
    });
    expect(push.dispatch).toHaveBeenCalledWith([row.id]);
  });

  it('filters current opt-out preferences before SSE and push', async () => {
    const { service, events, prisma, push } = setup();
    prisma.operationsNotification.findMany.mockResolvedValue([
      {
        ...row,
        recipient: {
          operationsNotificationPreference: {
            ...row.recipient.operationsNotificationPreference,
            crmIncomingMessagesEnabled: false,
          },
        },
      },
    ]);
    await service.publish([row.id], { wakeRetention: false });
    expect(events.emit).not.toHaveBeenCalled();
    expect(push.dispatch).toHaveBeenCalledWith([]);
  });

  it('processes bounded 100-group batches and does no work when empty', async () => {
    const { service, prisma } = setup();
    prisma.operationsNotification.findMany.mockResolvedValue([]);
    await service.publish([], { wakeRetention: false });
    expect(prisma.operationsNotification.findMany).not.toHaveBeenCalled();
    await service.publish(
      Array.from({ length: 201 }, (_, n) => `notification-${n}`),
      { wakeRetention: false },
    );
    expect(prisma.operationsNotification.findMany).toHaveBeenCalledTimes(3);
    for (const [query] of prisma.operationsNotification.findMany.mock
      .calls as unknown[][])
      expect(query).toMatchObject({ take: 100, where: { readAt: null } });
  });
});
