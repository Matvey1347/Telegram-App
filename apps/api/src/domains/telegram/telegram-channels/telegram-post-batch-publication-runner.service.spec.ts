/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test double */
import { TelegramSourceType } from '@prisma/client';
import {
  AmbiguousPostBatchPublicationError,
  TelegramPostBatchPublicationRunnerService,
} from './telegram-post-batch-publication-runner.service';

describe('TelegramPostBatchPublicationRunnerService', () => {
  const delivery = {
    id: 'delivery-1',
    batchId: 'batch-1',
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    managedPostId: 'post-1',
    scheduledAt: new Date('2026-09-14T10:00:00.000Z'),
    deleteAfterHours: 24,
    longTextMode: 'IMAGES_THEN_TEXT',
    attemptCount: 1,
    claimOwner: 'owner-1',
    managedPost: {
      status: 'SCHEDULED',
      publishedAt: null,
      telegramRemoteStatus: 'NONE',
      telegramMessageIds: [],
      text: 'Post text',
      buttonRows: [],
      sourceType: null,
      lastError: null,
    },
  };

  function setup(sourceType: 'BOT' | 'MTPROTO' = 'MTPROTO') {
    const prisma = {
      telegramManagedPost: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({
          status: 'PUBLISHED',
          publishedAt: delivery.scheduledAt,
        }),
      },
    };
    const publication = { publishBatchManagedPost: jest.fn() };
    const sourceAccess = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'source-1',
          sourceType,
          permissions: { canPostMessages: true, canDeleteMessages: true },
        },
      ]),
    };
    const lease = {
      runWithClaims: jest.fn(
        async (
          rows: unknown[],
          _status: string,
          work: (held: unknown[]) => Promise<unknown>,
        ) => ({ held: true, value: await work(rows) }),
      ),
    };
    const reconciliation = { reconcileManagedPostIdentities: jest.fn() };
    return {
      service: new TelegramPostBatchPublicationRunnerService(
        prisma as never,
        publication as never,
        sourceAccess as never,
        lease as never,
        reconciliation as never,
      ),
      prisma,
      publication,
      sourceAccess,
      lease,
      reconciliation,
    };
  }

  it('performs DB preflight before marking an MTProto side effect pending', async () => {
    const { service, prisma, publication, sourceAccess } = setup();

    await service.run(delivery as never, new Map());

    expect(prisma.telegramManagedPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PUBLISHING',
          sourceType: TelegramSourceType.MTPROTO,
          lastError: 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING',
        }),
      }),
    );
    expect(
      sourceAccess.sourcesForChannel.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prisma.telegramManagedPost.updateMany.mock.invocationCallOrder[0],
    );
    expect(publication.publishBatchManagedPost).toHaveBeenCalledTimes(1);
  });

  it('keeps a bot preflight failure safely retryable without a side-effect marker', async () => {
    const { service, prisma, sourceAccess } = setup('BOT');
    sourceAccess.sourcesForChannel.mockResolvedValue([]);

    await expect(service.run(delivery as never, new Map())).rejects.toThrow(
      'no publishing source',
    );
    expect(prisma.telegramManagedPost.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'media-only', text: null },
    { label: 'duplicate-content', text: 'Same content as another post' },
  ])('does not resend an ambiguous MTProto $label retry', async ({ text }) => {
    const { service, prisma, publication, reconciliation } = setup();
    prisma.telegramManagedPost.findFirst.mockResolvedValue({
      status: 'PUBLISHING',
      publishedAt: null,
    });
    const crashed = {
      ...delivery,
      attemptCount: 2,
      managedPost: {
        ...delivery.managedPost,
        status: 'PUBLISHING',
        sourceType: TelegramSourceType.MTPROTO,
        lastError: 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING',
        text,
      },
    };

    await expect(
      service.run(crashed as never, new Map()),
    ).rejects.toBeInstanceOf(AmbiguousPostBatchPublicationError);
    expect(reconciliation.reconcileManagedPostIdentities).toHaveBeenCalled();
    expect(publication.publishBatchManagedPost).not.toHaveBeenCalled();
  });

  it('allows a failed Bot delivery to use journal-aware publisher recovery', async () => {
    const { service, publication, reconciliation } = setup('BOT');
    const retry = {
      ...delivery,
      attemptCount: 2,
      managedPost: {
        ...delivery.managedPost,
        status: 'FAILED',
        sourceType: TelegramSourceType.BOT,
        lastError: 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING',
        telegramMessageIds: ['123'],
      },
    };

    await service.run(retry as never, new Map());

    expect(
      reconciliation.reconcileManagedPostIdentities,
    ).not.toHaveBeenCalled();
    expect(publication.publishBatchManagedPost).toHaveBeenCalledTimes(1);
  });

  it('retries an MTProto delivery after a concrete caught pre-side-effect failure', async () => {
    const { service, publication, reconciliation } = setup();
    const retry = {
      ...delivery,
      attemptCount: 2,
      managedPost: {
        ...delivery.managedPost,
        status: 'FAILED',
        sourceType: TelegramSourceType.MTPROTO,
        lastError: 'Storage upload failed before Telegram request',
      },
    };

    await service.run(retry as never, new Map());

    expect(
      reconciliation.reconcileManagedPostIdentities,
    ).not.toHaveBeenCalled();
    expect(publication.publishBatchManagedPost).toHaveBeenCalledTimes(1);
  });

  it('does not resend a Bot crash marker without a persisted delivery journal', async () => {
    const { service, publication } = setup('BOT');
    const crashed = {
      ...delivery,
      attemptCount: 2,
      managedPost: {
        ...delivery.managedPost,
        status: 'PUBLISHING',
        sourceType: TelegramSourceType.BOT,
        lastError: 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING',
        telegramMessageIds: [],
      },
    };

    await expect(
      service.run(crashed as never, new Map()),
    ).rejects.toBeInstanceOf(AmbiguousPostBatchPublicationError);
    expect(publication.publishBatchManagedPost).not.toHaveBeenCalled();
  });

  it('makes no external call when lease renewal is lost', async () => {
    const { service, publication, sourceAccess, lease } = setup();
    lease.runWithClaims.mockResolvedValue({ held: false, value: undefined });

    await service.run(delivery as never, new Map());

    expect(sourceAccess.sourcesForChannel).not.toHaveBeenCalled();
    expect(publication.publishBatchManagedPost).not.toHaveBeenCalled();
  });
});
