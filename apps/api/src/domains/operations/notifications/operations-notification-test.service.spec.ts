import { OperationsNotificationTestService } from './operations-notification-test.service';

function setup() {
  const access = { workspaceId: 'workspace-test', memberId: 'member-test' };
  const tx = {
    $executeRaw: jest.fn(),
    operationsNotification: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((work: (value: typeof tx) => unknown) => work(tx)),
  };
  const authorization = { require: jest.fn().mockResolvedValue(access) };
  const preferences = {
    preferences: jest
      .fn()
      .mockResolvedValue({ webPushEnabled: true, activeSubscriptionCount: 2 }),
  };
  const config = { get: jest.fn().mockReturnValue({ enabled: true }) };
  const store = {
    upsertMany: jest.fn().mockResolvedValue([{ id: 'test-intent' }]),
  };
  const publisher = {
    publish: jest
      .fn()
      .mockResolvedValue({ attempted: 2, delivered: 2, failed: 0, skipped: 0 }),
  };
  const service = new OperationsNotificationTestService(
    prisma as never,
    authorization as never,
    preferences as never,
    config as never,
    store as never,
    publisher as never,
  );
  return {
    access,
    tx,
    prisma,
    authorization,
    preferences,
    config,
    store,
    publisher,
    service,
  };
}

describe('explicit test notification', () => {
  it('uses only the requesting workspace/member and the normal transport after commit', async () => {
    const { service, store, publisher, authorization } = setup();
    await expect(service.send('user-test')).resolves.toEqual({
      status: 'sent',
      attempted: 2,
      delivered: 2,
      failed: 0,
      skipped: 0,
    });
    expect(authorization.require).toHaveBeenCalledWith(
      'user-test',
      'operations.notifications',
    );
    expect(store.upsertMany).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        workspaceId: 'workspace-test',
        recipientMemberId: 'member-test',
        type: 'SYSTEM_TEST',
        sourceKey: 'push-test',
      }),
    ]);
    expect(publisher.publish).toHaveBeenCalledWith(['test-intent']);
  });
  it.each(['unavailable', 'disabled', 'no_subscription'] as const)(
    'does not persist or dispatch when %s',
    async (status) => {
      const { service, config, preferences, store, publisher } = setup();
      if (status === 'unavailable')
        config.get.mockReturnValue({ enabled: false });
      if (status === 'disabled')
        preferences.preferences.mockResolvedValue({
          webPushEnabled: false,
          activeSubscriptionCount: 2,
        });
      if (status === 'no_subscription')
        preferences.preferences.mockResolvedValue({
          webPushEnabled: true,
          activeSubscriptionCount: 0,
        });
      expect((await service.send('user-test')).status).toBe(status);
      expect(store.upsertMany).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    },
  );
  it('serializes and throttles repeated user clicks without an extra intent or push', async () => {
    const { service, tx, store, publisher } = setup();
    tx.operationsNotification.findUnique.mockResolvedValue({
      createdAt: new Date(),
    });
    expect((await service.send('user-test')).status).toBe('rate_limited');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(store.upsertMany).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });
  it('reports delivery failure rather than claiming success and never retries', async () => {
    const { service, publisher } = setup();
    publisher.publish.mockResolvedValue({
      attempted: 2,
      delivered: 0,
      failed: 2,
      skipped: 0,
    });
    expect((await service.send('user-test')).status).toBe('failed');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
  it('refuses unauthorized callers before reading device configuration', async () => {
    const { service, authorization, config } = setup();
    authorization.require.mockRejectedValue(new Error('Forbidden'));
    await expect(service.send('foreign-user')).rejects.toThrow('Forbidden');
    expect(config.get).not.toHaveBeenCalled();
  });
});
