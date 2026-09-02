import webPush from 'web-push';
import { OperationsWebPushService } from './operations-web-push.service';

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

const row = {
  id: 'notification-1',
  workspaceId: 'workspace-1',
  recipientMemberId: 'member-1',
  type: 'CRM_MESSAGE_RECEIVED',
  priority: 'NORMAL',
  sourceKey: 'message:1',
  copyKey: 'crm.notification.messageReceived',
  title: 'Private preview title',
  body: 'Private message preview',
  metadata: {},
  targetUrl: '/ad-sales/inbox?workspaceId=workspace-1',
  requiredPermissionKey: 'adSales.crm.view',
  ownPermissionKey: null,
  anyPermissionKey: 'adSales.crm.viewAny',
  visibilityMemberId: null,
  visibilityResourceKey: null,
  readAt: null,
  deliverAt: new Date(),
  publishedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  pushAttemptedAt: null,
  createdAt: new Date(),
  recipient: { userId: 'user-1' },
};

describe('OperationsWebPushService', () => {
  function setup() {
    const prisma = {
      operationsNotification: { findMany: jest.fn().mockResolvedValue([row]) },
      operationsPushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'subscription-1',
            userId: 'user-1',
            endpoint: 'https://push.example/device',
            p256dh: 'p256dh',
            auth: 'auth',
          },
        ]),
        updateMany: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
    };
    const config = {
      get: () => ({
        enabled: true,
        subject: 'mailto:ops@example.com',
        publicKey: 'A'.repeat(64),
        privateKey: 'B'.repeat(32),
      }),
    };
    return {
      prisma,
      service: new OperationsWebPushService(prisma as never, config as never),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('claims before fanout and sends the privacy-safe agreed payload', async () => {
    const { prisma, service } = setup();
    (webPush.sendNotification as jest.Mock).mockResolvedValue({});

    await service.dispatch(['notification-1']);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (webPush.sendNotification as jest.Mock).mock.calls[0][1],
    );
    expect(payload).toEqual({
      id: 'notification-1',
      title: 'New CRM activity',
      body: 'Open Nexeloq to review the update.',
      targetUrl: '/ad-sales/inbox?workspaceId=workspace-1',
    });
    expect(JSON.stringify(payload)).not.toContain('Private message preview');
  });

  it.each([404, 410])(
    'disables only a stale %s subscription',
    async (statusCode) => {
      const { prisma, service } = setup();
      (webPush.sendNotification as jest.Mock).mockRejectedValue({ statusCode });
      await service.dispatch(['notification-1']);
      expect(prisma.operationsPushSubscription.updateMany).toHaveBeenCalledWith(
        {
          where: { id: { in: ['subscription-1'] }, active: true },
          data: { active: false, disabledAt: expect.any(Date) },
        },
      );
    },
  );

  it.each([429, 500])(
    'does not retry or disable a transient %s response',
    async (statusCode) => {
      const { prisma, service } = setup();
      (webPush.sendNotification as jest.Mock).mockRejectedValue({ statusCode });
      await service.dispatch(['notification-1']);
      expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
      expect(
        prisma.operationsPushSubscription.updateMany,
      ).not.toHaveBeenCalled();
    },
  );

  it('does not claim push when the User has no active device', async () => {
    const { prisma, service } = setup();
    prisma.operationsPushSubscription.findMany.mockResolvedValue([]);

    await service.dispatch(['notification-1']);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});
