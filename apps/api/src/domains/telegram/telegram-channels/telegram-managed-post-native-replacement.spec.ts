import {
  managedPostPublicationProjectionWhere,
  publishNativeManagedPost,
  recoverAcknowledgedNativeReplacement,
  retainNativeReplacementFailure,
} from './telegram-managed-post-native-replacement';
import { rescheduleContext } from './telegram-managed-post-rescheduler.remote';
import type { TelegramManagedPost } from '@prisma/client';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';

describe('native schedule recreation orchestration', () => {
  const date = new Date(Date.now() + 600_000);
  const post = {
    id: 'post',
    workspaceId: 'workspace',
    telegramChannelId: 'channel',
    text: 'Body',
    imageUrls: [],
    mediaItems: [],
    scheduleMode: 'TELEGRAM_NATIVE',
    scheduledAt: date,
    telegramScheduledMessageIds: ['11'],
    sourceId: 'obsolete',
    lastError: null,
  } as unknown as TelegramManagedPost;
  const setup = () => {
    const store = {
      prepare: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
      cancelled: jest.fn().mockResolvedValue(undefined),
      acknowledged: jest.fn().mockResolvedValue(undefined),
      failed: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      telegramManagedPost: {
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramManagedPostNativeRecovery: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACKED',
          sourceId: 'priority',
          scheduledAt: date,
          newMessageIds: ['22'],
        }),
      },
    };
    const access = { connectedAccount: jest.fn() };
    const mtproto = {
      publishPost: jest
        .fn()
        .mockImplementation(
          async (
            params: Parameters<TelegramMtprotoClient['publishPost']>[0],
          ) => {
            params.replacement!.validate([
              {
                id: '11',
                text: 'Body',
                date: date.toISOString(),
                hasMedia: false,
                html: 'Body',
                mediaKind: null,
                groupedId: null,
              },
            ]);
            await params.replacement!.beforeChange();
            await params.replacement!.afterCancel?.();
            return ['22'];
          },
        ),
    };
    return { store, prisma, access, mtproto };
  };
  const run = <T>(action: () => Promise<T>) =>
    rescheduleContext.run(
      {
        owner: 'claim',
        replacementFor: post.id,
        scheduledAt: date,
        signal: new AbortController().signal,
      },
      action,
    );

  it('creates fresh IDs under the priority account without opening the obsolete sender', async () => {
    const h = setup();
    const ids = await run(() =>
      publishNativeManagedPost({
        ...h,
        post,
        sourceId: 'priority',
        account: { id: 'priority' },
        params: {
          apiId: '1',
          apiHash: 'fixture',
          session: 'priority-session',
          html: 'Body',
          imageUrls: [],
          scheduleAt: date,
        },
        onCancel: jest.fn(),
        onCancellationConfirmed: jest.fn(),
      } as never),
    );
    expect(ids).toEqual(['22']);
    expect(h.access.connectedAccount).not.toHaveBeenCalled();
    expect(h.store.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'priority',
        oldMessageIds: ['11'],
        owner: 'claim',
      }),
    );
    expect(h.store.acknowledged).toHaveBeenCalledWith(
      expect.objectContaining({ newMessageIds: ['22'] }),
    );
    expect(h.store.start.mock.invocationCallOrder[0]).toBeLessThan(
      h.store.acknowledged.mock.invocationCallOrder[0],
    );
  });

  it('journals confirmed-missing schedules without cancelling nonexistent IDs', async () => {
    const h = setup();
    h.mtproto.publishPost.mockImplementation(
      async (params: Parameters<TelegramMtprotoClient['publishPost']>[0]) => {
        expect(params.replacement).toBeUndefined();
        await params.beforeSend?.();
        return ['22'];
      },
    );
    const ids = await rescheduleContext.run(
      {
        owner: 'claim',
        confirmedMissingScheduleFor: post.id,
        scheduledAt: date,
        signal: new AbortController().signal,
      },
      () =>
        publishNativeManagedPost({
          ...h,
          post,
          sourceId: 'priority',
          account: { id: 'priority' },
          params: {
            apiId: '1',
            apiHash: 'fixture',
            session: 'priority-session',
            html: 'Body',
            imageUrls: [],
            scheduleAt: date,
          },
          onCancel: jest.fn(),
          onCancellationConfirmed: jest.fn(),
        } as never),
    );
    expect(ids).toEqual(['22']);
    expect(h.store.prepare).toHaveBeenCalledTimes(1);
    expect(h.store.start).toHaveBeenCalledTimes(1);
    expect(h.store.cancelled).not.toHaveBeenCalled();
    expect(h.store.acknowledged).toHaveBeenCalledWith(
      expect.objectContaining({ newMessageIds: ['22'] }),
    );
  });

  it('fences final state projection with the same live owner and workspace', async () => {
    const where = await run(() =>
      Promise.resolve(managedPostPublicationProjectionWhere(post)),
    );
    expect(where).toMatchObject({
      id: post.id,
      workspaceId: post.workspaceId,
      telegramChannelId: post.telegramChannelId,
      status: 'SCHEDULED',
      deliveryClaimOwner: 'claim',
    });
    expect((where.deliveryClaimExpiresAt as { gt: Date }).gt).toBeInstanceOf(
      Date,
    );
  });

  it('keeps old IDs, source and scheduled state on an uncertain replacement failure', async () => {
    const h = setup();
    await run(() =>
      retainNativeReplacementFailure({
        prisma: h.prisma,
        store: h.store,
        postId: post.id,
        workspaceId: post.workspaceId,
        channelId: post.telegramChannelId,
      } as never),
    );
    const update = (
      h.prisma.telegramManagedPost.updateMany.mock.calls as unknown[][]
    )[0][0] as { data: Record<string, unknown> };
    expect(update.data).toMatchObject({ telegramRemoteStatus: 'UNKNOWN' });
    expect(update.data).not.toHaveProperty('sourceId');
    expect(update.data).not.toHaveProperty('telegramScheduledMessageIds');
    expect(update.data).not.toHaveProperty('status');
  });

  it('projects saved acknowledged new IDs only after exact native queue verification', async () => {
    const h = setup();
    const result = await recoverAcknowledgedNativeReplacement({
      prisma: h.prisma,
      post: { ...post, lastError: 'Lost response' },
      owner: 'claim',
      snapshots: [
        [
          {
            id: '22',
            text: 'Body',
            date: date.toISOString(),
            hasMedia: false,
            html: 'Body',
            mediaKind: null,
            groupedId: null,
          },
        ],
      ],
    } as never);
    expect(result).toBe(true);
    const update = (
      h.prisma.telegramManagedPost.updateMany.mock.calls as unknown[][]
    )[0][0] as { data: Record<string, unknown> };
    expect(update.data).toMatchObject({
      sourceId: 'priority',
      telegramScheduledMessageIds: ['22'],
      lastError: null,
    });
    expect(h.mtproto.publishPost).not.toHaveBeenCalled();
  });
});
