import type { Prisma } from '@prisma/client';
import webPush from 'web-push';
import { OperationsWebPushService } from './operations-web-push.service';
import { OperationsNotificationDeliveryPolicyService } from './operations-notification-delivery-policy.service';
import { pushRecipientSelect, pushPayload } from './operations-web-push-policy';
import { OPERATIONS_PUSH_MAX_QUEUE_AGE_MS } from './operations-web-push-policy';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

type Row = Prisma.OperationsNotificationGetPayload<{
  include: { recipient: { select: typeof pushRecipientSelect } };
}>;
const preference = {
  webPushEnabled: true,
  crmNotificationsEnabled: true,
  crmIncomingMessagesEnabled: true,
  crmFollowUpEnabled: true,
  crmAiLeadsEnabled: false,
  crmMessagePreviewEnabled: false,
};
const row = (id = 'notification-current', devices = 1): Row => ({
  id,
  workspaceId: 'workspace-current',
  recipientMemberId: 'member-current',
  type: 'CRM_MESSAGE_RECEIVED',
  priority: 'NORMAL',
  sourceKey: `conversation:${id}`,
  copyKey: 'crm.notification.messageReceived',
  title: 'New message from Ada',
  body: 'Private preview',
  metadata: {},
  targetUrl: '/ad-sales/inbox?workspaceId=workspace-current',
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
  recipient: {
    id: 'member-current',
    workspaceId: 'workspace-current',
    userId: 'user-current',
    role: 'owner',
    createdAt: new Date(),
    roleDefinition: null,
    operationsNotificationPreference: { ...preference },
    user: {
      operationsPushSubscriptions: Array.from({ length: devices }, (_, n) => ({
        id: `subscription-${n}`,
        endpoint: `https://push.example/device-${n}`,
        p256dh: 'key',
        auth: 'auth',
      })),
    },
  },
});

function setup(rows: Row[] = [row()]) {
  const tx = {
    operationsNotification: { findMany: jest.fn().mockResolvedValue(rows) },
    $queryRaw: jest
      .fn<Promise<{ id: string }[]>, [Prisma.Sql]>()
      .mockImplementation((query) => {
        const claimedAt = query.values[0];
        if (!(claimedAt instanceof Date))
          throw new Error('Expected atomic claim timestamp');
        for (const item of rows) item.pushAttemptedAt = claimedAt;
        return Promise.resolve(rows.map(({ id }) => ({ id })));
      }),
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
    operationsPushSubscription: { updateMany: jest.fn() },
  };
  const config = {
    get: () => ({
      enabled: true,
      subject: 'mailto:ops@example.com',
      publicKey: 'A'.repeat(64),
      privateKey: 'B'.repeat(32),
    }),
  };
  const permissions = { canAccess: jest.fn().mockReturnValue(true) };
  const policies = new OperationsNotificationDeliveryPolicyService();
  return {
    tx,
    prisma,
    permissions,
    policies,
    service: new OperationsWebPushService(
      prisma as never,
      config as never,
      permissions as never,
      policies,
    ),
  };
}

describe('OperationsWebPushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(webPush.sendNotification).mockResolvedValue({} as never);
  });

  it('rechecks permissions and preferences, atomically claims then sends a privacy-safe bounded payload', async () => {
    const { service, tx, permissions } = setup();
    await expect(service.dispatch(['notification-current'])).resolves.toEqual({
      attempted: 1,
      delivered: 1,
      failed: 0,
      skipped: 0,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(permissions.canAccess).toHaveBeenCalled();
    const call = jest.mocked(webPush.sendNotification).mock.calls[0];
    const payload: unknown = JSON.parse(call[1] as string);
    expect(payload).toEqual({
      id: 'notification-current',
      title: 'New CRM activity',
      body: 'Open Nexeloq to review the update.',
      targetUrl: '/ad-sales/inbox?workspaceId=workspace-current',
    });
    expect(call[2]).toEqual({ TTL: 300, timeout: 10000, urgency: 'normal' });
    expect(tx.operationsNotification.findMany.mock.calls).toHaveLength(2);
    const query = (
      tx.operationsNotification.findMany.mock.calls as unknown[][]
    )[0][0];
    expect(query).toMatchObject({
      take: 100,
      where: { readAt: null, pushAttemptedAt: null },
      include: {
        recipient: {
          select: {
            user: {
              select: {
                operationsPushSubscriptions: {
                  take: 5,
                  where: { active: true },
                },
              },
            },
          },
        },
      },
    });
  });

  it('shows the bounded message preview only if currently enabled', async () => {
    const notification = row();
    notification.recipient.operationsNotificationPreference!.crmMessagePreviewEnabled = true;
    const { service } = setup([notification]);
    await service.dispatch([notification.id]);
    expect(jest.mocked(webPush.sendNotification).mock.calls[0][1]).toContain(
      'Private preview',
    );
  });

  it.each(['TELEGRAM_ACCOUNT_REAUTH_REQUIRED', 'MOCK_SUPPORT_MESSAGE'])(
    'does not apply CRM preview preferences to %s',
    (type) => {
      const notification = row();
      const payload: unknown = JSON.parse(
        pushPayload(
          { ...notification, type: type as Row['type'] },
          { ...preference, crmMessagePreviewEnabled: true },
        ),
      );
      expect(payload).toEqual({
        id: notification.id,
        title: 'New workspace activity',
        body: 'Open Nexeloq to review the update.',
        targetUrl: notification.targetUrl,
      });
    },
  );

  it.each([2, 5])(
    'delivers to %i unique subscribed devices after one group claim',
    async (devices) => {
      const { service, tx } = setup([row('notification-current', devices)]);
      const result = await service.dispatch(['notification-current']);
      expect(result.delivered).toBe(devices);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      // The ready cohort revalidates the whole group, not one DB read/device.
      expect(tx.operationsNotification.findMany).toHaveBeenCalledTimes(2);
    },
  );

  it.each([404, 410])(
    'batch-deactivates stale %i subscriptions without retry',
    async (statusCode) => {
      const { service, prisma } = setup([row('notification-current', 2)]);
      jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode });
      expect((await service.dispatch(['notification-current'])).failed).toBe(2);
      expect(
        prisma.operationsPushSubscription.updateMany,
      ).toHaveBeenCalledTimes(1);
      expect(jest.mocked(webPush.sendNotification)).toHaveBeenCalledTimes(2);
    },
  );

  it.each([429, 500])(
    'does not retry a transient %i failure',
    async (statusCode) => {
      const { service, prisma } = setup();
      jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode });
      expect((await service.dispatch(['notification-current'])).failed).toBe(1);
      expect(
        prisma.operationsPushSubscription.updateMany,
      ).not.toHaveBeenCalled();
    },
  );

  it('does not claim when there is no subscription', async () => {
    const { service, tx } = setup([row('notification-current', 0)]);
    expect((await service.dispatch(['notification-current'])).skipped).toBe(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['permission', 'master', 'incoming', 'global', 'workspace'])(
    'skips delivery after %s is revoked',
    async (kind) => {
      const notification = row();
      const { service, tx, permissions } = setup([notification]);
      if (kind === 'permission') permissions.canAccess.mockReturnValue(false);
      if (kind === 'master')
        notification.recipient.operationsNotificationPreference!.crmNotificationsEnabled = false;
      if (kind === 'incoming')
        notification.recipient.operationsNotificationPreference!.crmIncomingMessagesEnabled = false;
      if (kind === 'global')
        notification.recipient.operationsNotificationPreference!.webPushEnabled = false;
      if (kind === 'workspace')
        notification.recipient.workspaceId = 'workspace-foreign';
      expect((await service.dispatch([notification.id])).skipped).toBe(1);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    },
  );

  it('uses a domain policy veto before claiming read/inactive CRM conversations', async () => {
    const { service, policies, tx } = setup();
    policies.register('CRM_MESSAGE_RECEIVED', () => Promise.resolve([]));
    expect((await service.dispatch(['notification-current'])).skipped).toBe(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not send when another transaction/read update prevents its atomic claim', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    expect((await service.dispatch(['notification-current'])).skipped).toBe(1);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it('exposes a failed ready-cohort read without claiming a network attempt and releases its capacity', async () => {
    const notification = row();
    const rows = [notification];
    const { service, tx } = setup(rows);
    tx.operationsNotification.findMany
      .mockResolvedValueOnce([notification])
      .mockRejectedValueOnce(new Error('Freshness unavailable'));
    await expect(service.dispatch([notification.id])).rejects.toThrow(
      'Freshness unavailable',
    );
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    const fresh = row('fresh-after-validation-error');
    rows.splice(0, rows.length, fresh);
    tx.operationsNotification.findMany.mockResolvedValue(rows);
    expect((await service.dispatch([fresh.id])).delivered).toBe(1);
  });

  it('keeps global concurrency at 8 and refuses a saturated 500-delivery queue before claim', async () => {
    const rows = Array.from({ length: 100 }, (_, n) =>
      row(`notification-${n}`, 5),
    );
    const { service, tx } = setup(rows);
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.mocked(webPush.sendNotification).mockImplementation(async () => {
      active += 1;
      maximum = Math.max(active, maximum);
      await gate;
      active -= 1;
      return {} as never;
    });
    const first = service.dispatch(rows.map(({ id }) => id));
    for (let n = 0; n < 80; n += 1) await Promise.resolve();
    const second = await service.dispatch(rows.map(({ id }) => id));
    expect(second).toEqual({
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: 100,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    release();
    expect((await first).delivered).toBe(500);
    expect(maximum).toBe(8);
  });

  it('performs no work when no events exist', async () => {
    const { service, prisma } = setup();
    await service.dispatch([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it('skips aged queued deliveries while preserving timely attempts and releases the queue capacity', async () => {
    const rows = Array.from({ length: 15 }, (_, n) => row(`notification-${n}`));
    const { service, tx } = setup(rows);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.mocked(webPush.sendNotification).mockImplementation(async () => {
      await gate;
      return {} as never;
    });
    const first = service.dispatch(rows.map(({ id }) => id));
    try {
      for (let n = 0; n < 80; n += 1) await Promise.resolve();
      expect(webPush.sendNotification).toHaveBeenCalledTimes(8);
      clock.mockReturnValue(OPERATIONS_PUSH_MAX_QUEUE_AGE_MS);
      release();
      expect(await first).toEqual({
        attempted: 8,
        delivered: 8,
        failed: 0,
        skipped: 7,
      });
      // A second fresh batch uses the same capacity; expired work is not rearmed.
      const fresh = Array.from({ length: 15 }, (_, n) => row(`fresh-${n}`));
      for (const item of fresh)
        item.expiresAt = new Date(new Date().getTime() + 60_000);
      tx.operationsNotification.findMany.mockResolvedValue(fresh);
      tx.$queryRaw.mockImplementation((query) => {
        const claimedAt = query.values[0];
        if (!(claimedAt instanceof Date))
          throw new Error('Expected atomic claim timestamp');
        for (const item of fresh) item.pushAttemptedAt = claimedAt;
        return Promise.resolve(fresh.map(({ id }) => ({ id })));
      });
      expect(
        (await service.dispatch(fresh.map(({ id }) => id))).delivered,
      ).toBe(15);
    } finally {
      release();
      await first;
      clock.mockRestore();
    }
  });

  it.each([
    'preview',
    'incoming',
    'master',
    'read',
    'permission',
    'subscription',
    'domain-read',
    'expired',
    'reclaimed',
  ])(
    'revalidates %s after a saturated queue receives network capacity',
    async (change) => {
      const rows = Array.from({ length: 9 }, (_, n) => row(`queued-${n}`));
      for (const item of rows)
        item.recipient.operationsNotificationPreference!.crmMessagePreviewEnabled = true;
      const target = rows[8];
      const { service, permissions, policies } = setup(rows);
      let domainAllowed = true;
      policies.register('CRM_MESSAGE_RECEIVED', (_tx, facts) =>
        Promise.resolve(
          facts
            .filter((fact) => domainAllowed || fact.id !== target.id)
            .map(({ id }) => id),
        ),
      );
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      jest.mocked(webPush.sendNotification).mockImplementation(async () => {
        await gate;
        return {} as never;
      });
      const delivery = service.dispatch(rows.map(({ id }) => id));
      try {
        for (let n = 0; n < 80; n += 1) await Promise.resolve();
        expect(webPush.sendNotification).toHaveBeenCalledTimes(8);
        if (change === 'preview')
          target.recipient.operationsNotificationPreference!.crmMessagePreviewEnabled = false;
        if (change === 'incoming')
          target.recipient.operationsNotificationPreference!.crmIncomingMessagesEnabled = false;
        if (change === 'master')
          target.recipient.operationsNotificationPreference!.crmNotificationsEnabled = false;
        if (change === 'read') target.readAt = new Date();
        if (change === 'subscription')
          target.recipient.user.operationsPushSubscriptions = [];
        if (change === 'permission')
          permissions.canAccess.mockImplementation(
            (_member: unknown, scope: { sourceKey: string }) =>
              scope.sourceKey !== target.sourceKey,
          );
        if (change === 'domain-read') domainAllowed = false;
        if (change === 'expired') target.expiresAt = new Date(0);
        if (change === 'reclaimed')
          target.pushAttemptedAt = new Date(
            target.pushAttemptedAt!.getTime() + 1,
          );
        release();
        const result = await delivery;
        if (change === 'preview') {
          expect(result.delivered).toBe(9);
          const call = jest.mocked(webPush.sendNotification).mock.calls.at(-1)!;
          const payload: unknown = JSON.parse(call[1] as string);
          expect(payload).toMatchObject({
            id: target.id,
            title: 'New CRM activity',
            body: 'Open Nexeloq to review the update.',
          });
        } else
          expect(result).toEqual({
            attempted: 8,
            delivered: 8,
            failed: 0,
            skipped: 1,
          });
      } finally {
        release();
        await delivery;
      }
    },
  );

  it.each([
    'same-conversation',
    'other-conversation',
    'background',
    'closed-pwa',
  ])(
    'does not suppress %s delivery based on an unreliable presence hint',
    async (hint) => {
      const notification = row();
      notification.metadata = { clientPresenceHint: hint };
      const { service } = setup([notification]);
      expect((await service.dispatch([notification.id])).delivered).toBe(1);
    },
  );
});
