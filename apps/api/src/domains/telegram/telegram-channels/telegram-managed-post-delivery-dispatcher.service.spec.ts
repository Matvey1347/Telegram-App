import { TelegramManagedPostDeliveryDispatcherService } from './telegram-managed-post-delivery-dispatcher.service';
import {
  assertManagedPostDeliveryActive,
  managedPostDeliveryContext,
} from './telegram-managed-post-delivery-context';

const post = {
  id: 'post',
  workspaceId: 'workspace',
  telegramChannelId: 'channel',
};
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup(state = 'READY') {
  const prisma = {
    telegramManagedPost: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ status: 'FAILED' }),
    },
  };
  const publication = {
    publishManagedPost: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  };
  const journal = {
    summarise: jest.fn().mockResolvedValue({ state, retryAt: null }),
  };
  const reconciliation = {
    reconcileManagedPostIdentities: jest.fn().mockResolvedValue({}),
  };
  const moduleRef = { resolve: jest.fn().mockResolvedValue(reconciliation) };
  const service = new TelegramManagedPostDeliveryDispatcherService(
    prisma as never,
    publication as never,
    journal as never,
    moduleRef as never,
  );
  return { prisma, publication, journal, reconciliation, service };
}

describe('durable publication dispatch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('returns after durable claim and sends another channel while a publisher never settles', async () => {
    const test = setup();
    test.publication.publishManagedPost.mockImplementationOnce(
      () => new Promise(() => {}),
    );
    await expect(test.service.dispatch(post)).resolves.toBe(true);
    await expect(
      test.service.dispatch({
        ...post,
        id: 'second',
        telegramChannelId: 'another',
      }),
    ).resolves.toBe(true);
    await flush();
    expect(test.publication.publishManagedPost).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(test.prisma.telegramManagedPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          deliveryNextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });

  it('can recover an expired claim even if the previous failure-persistence promise hangs', async () => {
    const test = setup();
    test.publication.publishManagedPost.mockImplementationOnce(() => new Promise(() => {}));
    await test.service.dispatch(post); await flush();
    // Failure recovery itself can wait on a broken database connection. The
    // durable lease, not an immortal in-process set, decides who can recover.
    test.journal.summarise.mockImplementationOnce(() => new Promise(() => {}));
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(test.service.dispatch(post)).resolves.toBe(true);
    await flush();
    expect(test.publication.publishManagedPost).toHaveBeenCalledTimes(2);
  });

  it('never sends when the durable claim is rejected by another worker', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.updateMany.mockResolvedValue({ count: 0 });
    expect(await test.service.dispatch(post)).toBe(false);
    expect(test.publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('reconciles uncertain remote outcome without resending', async () => {
    const test = setup('UNKNOWN');
    await test.service.dispatch(post);
    await flush();
    expect(
      test.reconciliation.reconcileManagedPostIdentities,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ explicit: true, postId: post.id }),
    );
    expect(test.publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('accepts recovered publication and does not overwrite it as failed', async () => {
    const test = setup('UNKNOWN');
    test.prisma.telegramManagedPost.findFirst.mockResolvedValue({
      status: 'PUBLISHED',
    });
    await test.service.dispatch(post);
    await flush();
    expect(
      test.prisma.telegramManagedPost.updateMany.mock.calls.some(
        ([input]) => input.data.status === 'FAILED',
      ),
    ).toBe(false);
  });

  it('schedules confirmed rate-limit rejection at Telegram retry deadline', async () => {
    const test = setup('RETRY');
    const retryAt = new Date(Date.now() + 70_000);
    test.journal.summarise.mockResolvedValue({ state: 'RETRY', retryAt });
    test.publication.publishManagedPost.mockRejectedValue(
      new Error('rate limited'),
    );
    await test.service.dispatch(post);
    await flush();
    expect(test.prisma.telegramManagedPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryNextAttemptAt: retryAt }),
      }),
    );
  });

  it('blocks permanent rejection without an endless retry timer', async () => {
    const test = setup('BLOCKED');
    await expect(test.service.dispatch(post)).rejects.toThrow('permanently rejected');
    expect(test.publication.publishManagedPost).not.toHaveBeenCalled();
    expect(test.prisma.telegramManagedPost.updateMany).not.toHaveBeenCalled();
  });

  it('fences preparation resuming after deadline before any remote call', async () => {
    const prisma = {
      telegramManagedPost: { count: jest.fn().mockResolvedValue(0) },
    };
    const controller = new AbortController();
    controller.abort();
    await expect(
      managedPostDeliveryContext.run(
        { postId: post.id, owner: 'expired', signal: controller.signal },
        () => assertManagedPostDeliveryActive(prisma as never, post.id),
      ),
    ).rejects.toBeDefined();
    expect(prisma.telegramManagedPost.count).not.toHaveBeenCalled();
  });

  it('can admit 100 independent channel deadlines without waiting for the first send', async () => {
    const test = setup();
    test.publication.publishManagedPost.mockImplementation(
      () => new Promise(() => {}),
    );
    for (let i = 0; i < 100; i++)
      expect(
        await test.service.dispatch({
          ...post,
          id: `post-${i}`,
          telegramChannelId: `channel-${i}`,
        }),
      ).toBe(true);
    await flush();
    expect(test.publication.publishManagedPost).toHaveBeenCalledTimes(100);
    await jest.advanceTimersByTimeAsync(30_000);
  });
});
