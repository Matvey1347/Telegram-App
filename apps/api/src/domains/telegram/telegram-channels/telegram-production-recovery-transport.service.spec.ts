import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramProductionRecoveryTransportService } from './telegram-production-recovery-transport.service';
import { TelegramProductionRecoveryTransportDto } from './telegram-production-recovery-transport.dto';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';

function fixture() {
  const post = {
    id: 'post',
    deliveryClaimExpiresAt: new Date(Date.now() + 120_000),
    scheduledAt: new Date(Date.now() + 3600_000),
    sourceId: 'account',
    sourceType: 'MTPROTO',
    status: 'SCHEDULED',
    scheduleMode: 'TELEGRAM_NATIVE',
    text: 'Hello',
    publishMode: 'TEXT',
    imageUrls: [],
    mediaItems: [],
    telegramScheduledMessageIds: ['17'],
  };
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
    },
    telegramChannelAdminLink: {
      findFirst: jest.fn().mockResolvedValue({ id: 'link' }),
    },
    telegramChannelSourceAccess: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ canPostMessages: true, canDeleteMessages: true }),
    },
    telegramManagedPost: {
      findFirst: jest.fn().mockResolvedValue(post),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const support = { workspace: jest.fn().mockResolvedValue('workspace') };
  const access = {
    connectedAccount: jest
      .fn()
      .mockResolvedValue({ mtprotoPublishingEnabled: true }),
    accountCredentials: jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'private-hash',
      session: 'private-session',
    }),
    mtprotoChannelReference: jest
      .fn()
      .mockReturnValue({ telegramChatId: '123' }),
  };
  const mtproto = {
    getScheduledMessagesByIds: jest.fn().mockResolvedValue([
      {
        id: '17',
        text: 'Hello',
        html: 'Hello',
        hasMedia: false,
        mediaKind: null,
        groupedId: null,
        date: post.scheduledAt.toISOString(),
      },
    ]),
    getScheduledHistory: jest
      .fn()
      .mockResolvedValue([{ id: '17', date: post.scheduledAt.toISOString() }]),
    getManagedPostMessages: jest.fn().mockResolvedValue({
      recentPublished: [],
      recentPublishedComplete: true,
    }),
    getAccountProfile: jest.fn().mockResolvedValue({ id: 'reader' }),
    deleteScheduledPost: jest.fn().mockResolvedValue(undefined),
    publishPost: jest.fn().mockResolvedValue(['18']),
  };
  const nativeStore = {
    read: jest.fn().mockResolvedValue({
      owner: 'reschedule:owner',
      sourceId: 'account',
      scheduledAt: post.scheduledAt,
      oldMessageIds: ['17'],
    }),
    start: jest.fn().mockResolvedValue(undefined),
    cancelled: jest.fn().mockResolvedValue(undefined),
    acknowledged: jest.fn().mockResolvedValue(undefined),
    failed: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TelegramProductionRecoveryTransportService(
    prisma as never,
    support as never,
    access as never,
    mtproto as never,
    nativeStore as never,
  );
  const request: TelegramProductionRecoveryTransportDto = {
    operation: 'publish',
    accountId: 'account',
    postId: 'post',
    claimOwner: 'reschedule:owner',
    scheduleAt: post.scheduledAt.toISOString(),
    data: { html: '<b>Hello</b>', imageUrls: [], mediaItems: [] },
  };
  const execute = (
    input: TelegramProductionRecoveryTransportDto = request,
    signal = new AbortController().signal,
  ) => service.execute('user', 'channel', input, signal);
  return { prisma, access, mtproto, request, execute, post, nativeStore };
}

describe('production recovery scoped Telegram transport', () => {
  const overdueDeletionFixture = () => {
    const f = fixture();
    f.post.scheduledAt = new Date(Date.now() - 3600_000);
    Object.assign(f.request, {
      operation: 'delete',
      accountId: 'priority-account',
      messageIds: ['17'],
      scheduleAt: f.post.scheduledAt.toISOString(),
    });
    f.prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(f.post)
      .mockResolvedValueOnce(null);
    return f;
  };

  it('retires an overdue complete schedule through an alternate verified editor without sending', async () => {
    const f = overdueDeletionFixture();
    await expect(f.execute()).resolves.toBeUndefined();
    expect(f.mtproto.getScheduledMessagesByIds).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['17'] }),
    );
    expect(f.mtproto.deleteScheduledPost).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['17'] }),
    );
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    expect(f.nativeStore.start).not.toHaveBeenCalled();
  });

  it('rejects future cross-account deletion rather than bypassing combined replacement', async () => {
    const f = fixture();
    Object.assign(f.request, {
      operation: 'delete',
      accountId: 'priority-account',
      messageIds: ['17'],
    });
    await expect(f.execute()).rejects.toThrow('overdue complete schedule');
    expect(f.mtproto.getScheduledMessagesByIds).not.toHaveBeenCalled();
    expect(f.mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });

  it('rejects overdue alternate deletion when current Telegram IDs belong to different content', async () => {
    const f = overdueDeletionFixture();
    f.mtproto.getScheduledMessagesByIds.mockResolvedValue([
      {
        id: '17',
        text: 'Advertising',
        html: 'Advertising',
        hasMedia: false,
        mediaKind: null,
        groupedId: null,
        date: new Date().toISOString(),
      },
    ]);
    await expect(f.execute()).rejects.toThrow('do not match');
    expect(f.mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });

  it('does not delete an overdue ID aliased by a foreign advertising post', async () => {
    const f = overdueDeletionFixture();
    f.prisma.telegramManagedPost.findFirst
      .mockReset()
      .mockResolvedValueOnce(f.post)
      .mockResolvedValueOnce({ id: 'foreign-ad' });
    await expect(f.execute()).rejects.toThrow('overlap another managed post');
    expect(f.mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });

  it('starts a missing-schedule send only through the post-preparation callback', async () => {
    const f = fixture();
    f.mtproto.publishPost.mockImplementation(
      async (params: Parameters<TelegramMtprotoClient['publishPost']>[0]) => {
        expect(f.nativeStore.start).not.toHaveBeenCalled();
        await params.beforeSend?.();
        expect(f.nativeStore.start).toHaveBeenCalledTimes(1);
        return ['18'];
      },
    );
    await expect(f.execute()).resolves.toEqual(['18']);
  });

  it('marks preflight failure without starting a destructive native attempt', async () => {
    const f = fixture();
    f.mtproto.publishPost.mockRejectedValue(
      new Error('Media unavailable before beforeSend'),
    );
    await expect(f.execute()).rejects.toThrow('reconcile before retrying');
    expect(f.nativeStore.start).not.toHaveBeenCalled();
    expect(f.nativeStore.failed).toHaveBeenCalledTimes(1);
    expect(f.nativeStore.acknowledged).not.toHaveBeenCalled();
  });

  const replacementFixture = () => {
    const f = fixture();
    f.request.operation = 'replace';
    f.request.accountId = 'priority-account';
    f.request.messageIds = ['17'];
    f.nativeStore.read.mockResolvedValue({
      owner: 'reschedule:owner',
      sourceId: 'priority-account',
      scheduledAt: f.post.scheduledAt,
      oldMessageIds: ['17'],
    });
    f.prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(f.post)
      .mockResolvedValueOnce(null);
    return f;
  };

  it('replaces exact old IDs through the selected editor and journals before acknowledgement', async () => {
    const f = replacementFixture();
    const order: string[] = [];
    f.nativeStore.start.mockImplementation(() => {
      order.push('start');
      return Promise.resolve();
    });
    f.nativeStore.cancelled.mockImplementation(() => {
      order.push('cancelled');
      return Promise.resolve();
    });
    f.nativeStore.acknowledged.mockImplementation(() => {
      order.push('acknowledged');
      return Promise.resolve();
    });
    f.mtproto.publishPost.mockImplementation(
      async (params: Parameters<TelegramMtprotoClient['publishPost']>[0]) => {
        const replacement = params.replacement!;
        replacement.validate([
          {
            id: '17',
            text: 'Hello',
            html: 'Hello',
            hasMedia: false,
            mediaKind: null,
            groupedId: null,
            date: f.post.scheduledAt.toISOString(),
          },
        ]);
        await replacement.beforeChange();
        await replacement.afterCancel?.();
        order.push('send');
        return ['18'];
      },
    );
    await expect(f.execute()).resolves.toEqual(['18']);
    expect(order).toEqual(['start', 'cancelled', 'send', 'acknowledged']);
    expect(f.nativeStore.acknowledged).toHaveBeenCalledWith({
      owner: f.request.claimOwner,
      postId: 'post',
      workspaceId: 'workspace',
      channelId: 'channel',
      newMessageIds: ['18'],
    });
    expect(f.mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });

  it.each([
    { ids: ['99'] },
    { ids: ['17', '17'] },
    { ids: ['17', '99'] },
    { ids: [] },
  ])('rejects non-exact replacement IDs %p', async ({ ids }) => {
    const f = replacementFixture();
    f.request.messageIds = ids;
    await expect(f.execute()).rejects.toBeInstanceOf(ConflictException);
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    expect(f.nativeStore.start).not.toHaveBeenCalled();
  });

  it('rejects aliases held by another scheduled post including advertising', async () => {
    const f = replacementFixture();
    f.prisma.telegramManagedPost.findFirst
      .mockReset()
      .mockResolvedValueOnce(f.post)
      .mockResolvedValueOnce({ id: 'foreign-ad' });
    await expect(f.execute()).rejects.toThrow('overlap another managed post');
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    const foreignQuery = (
      f.prisma.telegramManagedPost.findFirst.mock.calls as unknown as Array<
        [{ where: Record<string, unknown> }]
      >
    )[1][0].where;
    expect(foreignQuery).toMatchObject({
      id: { not: 'post' },
      status: { in: ['SCHEDULED', 'PUBLISHING'] },
      telegramScheduledMessageIds: { hasSome: ['17'] },
    });
    expect(foreignQuery).not.toHaveProperty('adSalePlacements');
  });

  it('requires delete permission even for a linked channel admin', async () => {
    const f = replacementFixture();
    f.prisma.telegramChannelSourceAccess.findFirst.mockResolvedValue({
      canPostMessages: true,
      canDeleteMessages: false,
    });
    await expect(f.execute()).rejects.toThrow(
      'publishing and deletion permission',
    );
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
  });

  it('rejects a selected account that differs from the prepared durable generation', async () => {
    const f = replacementFixture();
    f.nativeStore.read.mockResolvedValue({
      owner: 'reschedule:owner',
      sourceId: 'another-account',
      scheduledAt: f.post.scheduledAt,
      oldMessageIds: ['17'],
    });
    await expect(f.execute()).rejects.toThrow('preparation does not match');
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    expect(f.nativeStore.start).not.toHaveBeenCalled();
  });

  it.each([
    { remote: [] },
    {
      remote: [
        {
          id: '17',
          text: 'Unrelated advertising',
          html: 'Unrelated advertising',
          hasMedia: false,
          mediaKind: null,
          groupedId: null,
          date: new Date().toISOString(),
        },
      ],
    },
  ])(
    'does not start cancellation when live queue identity changed',
    async ({ remote }) => {
      const f = replacementFixture();
      f.mtproto.publishPost.mockImplementation(
        (params: Parameters<TelegramMtprotoClient['publishPost']>[0]) => {
          params.replacement!.validate(remote);
          return Promise.resolve(['18']);
        },
      );
      await expect(f.execute()).rejects.toBeInstanceOf(ConflictException);
      expect(f.nativeStore.start).not.toHaveBeenCalled();
      expect(f.nativeStore.acknowledged).not.toHaveBeenCalled();
    },
  );

  it('does not send or cancel when the durable start cannot be written', async () => {
    const f = replacementFixture();
    f.nativeStore.start.mockRejectedValue(new Error('journal unavailable'));
    f.mtproto.publishPost.mockImplementation(
      async (params: Parameters<TelegramMtprotoClient['publishPost']>[0]) => {
        await params.replacement!.beforeChange();
        await params.replacement!.afterCancel?.();
        return ['18'];
      },
    );
    await expect(f.execute()).rejects.toThrow('reconcile before retrying');
    expect(f.nativeStore.cancelled).not.toHaveBeenCalled();
    expect(f.nativeStore.acknowledged).not.toHaveBeenCalled();
  });

  it('returns no success when acknowledgement persistence fails and never releases the claim', async () => {
    const f = fixture();
    f.nativeStore.acknowledged.mockRejectedValue(
      new Error('journal unavailable'),
    );
    await expect(f.execute()).rejects.toThrow('reconcile before retrying');
    expect(f.nativeStore.failed).toHaveBeenCalledWith({
      owner: f.request.claimOwner,
      postId: 'post',
      workspaceId: 'workspace',
      channelId: 'channel',
    });
    expect(f.prisma.telegramManagedPost).not.toHaveProperty('updateMany');
  });

  it('uses only server-resolved credentials and stored deadline for a live ordinary claim', async () => {
    const f = fixture();
    await expect(f.execute()).resolves.toEqual(['18']);
    expect(
      (
        f.prisma.telegramManagedPost.findFirst.mock.calls as unknown as Array<
          [{ where: unknown }]
        >
      )[0][0].where,
    ).toMatchObject({
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      status: 'SCHEDULED',
      postBatchDelivery: { is: null },
      adSalePlacements: { none: {} },
      mutualPromotionDelivery: { is: null },
      deliveryClaimOwner: 'reschedule:owner',
    });
    expect(
      (f.mtproto.publishPost.mock.calls as unknown[][])[0][0],
    ).toMatchObject({
      scheduleAt: f.post.scheduledAt,
      apiHash: 'private-hash',
      session: 'private-session',
    });
  });
  it('does not access another workspace channel', async () => {
    const f = fixture();
    f.prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(f.execute()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.access.accountCredentials).not.toHaveBeenCalled();
  });
  it('rejects an unlinked account even within the workspace', async () => {
    const f = fixture();
    f.prisma.telegramChannelAdminLink.findFirst.mockResolvedValue(null);
    f.prisma.telegramChannelSourceAccess.findFirst.mockResolvedValue(null);
    await expect(f.execute()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
  });
  it.each(['advertising', 'expired claim', 'changed post'])(
    'fails closed when %s is excluded from the scoped ordinary claim query',
    async () => {
      const f = fixture();
      f.prisma.telegramManagedPost.findFirst.mockResolvedValue(null);
      await expect(f.execute()).rejects.toBeInstanceOf(ConflictException);
      expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    },
  );
  it('rejects a mismatched date and leaves the send lane untouched', async () => {
    const f = fixture();
    f.request.scheduleAt = new Date(Date.now() + 7200_000).toISOString();
    await expect(f.execute()).rejects.toBeInstanceOf(ConflictException);
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
  });
  it('rejects client credentials even when bypassing global DTO validation', async () => {
    const f = fixture();
    Object.assign(f.request, { session: 'client-key' });
    await expect(f.execute()).rejects.toBeInstanceOf(BadRequestException);
    expect(f.access.accountCredentials).not.toHaveBeenCalled();
  });
  it('does not return raw provider secrets or URLs', async () => {
    const f = fixture();
    f.mtproto.publishPost.mockRejectedValue(
      new Error('failed private-session https://private.example/token'),
    );
    await expect(f.execute()).rejects.toThrow(
      'Telegram recovery transport failed; reconcile before retrying',
    );
  });
  it('redacts provider HTTP exceptions as well as ordinary errors', async () => {
    const f = fixture();
    f.mtproto.publishPost.mockRejectedValue(
      new BadRequestException('private-session secret'),
    );
    await expect(f.execute()).rejects.toThrow(
      'Telegram recovery transport failed; reconcile before retrying',
    );
  });
  it('aborts transport on the server-owned deadline and preserves an uncertain outcome', async () => {
    const f = fixture();
    const deadline = new AbortController();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(deadline.signal);
    f.mtproto.publishPost.mockImplementation(
      (params: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          params.signal.addEventListener(
            'abort',
            () => reject(new Error('private transport aborted')),
            { once: true },
          );
        }),
    );
    try {
      const result = f.execute();
      for (let i = 0; i < 30 && !f.mtproto.publishPost.mock.calls.length; i++)
        await Promise.resolve();
      expect(f.mtproto.publishPost).toHaveBeenCalledTimes(1);
      deadline.abort();
      await expect(result).rejects.toThrow(
        'Telegram recovery transport cancelled or timed out; reconcile before retrying',
      );
      expect(f.nativeStore.failed).toHaveBeenCalledWith({
        owner: f.request.claimOwner,
        postId: 'post',
        workspaceId: 'workspace',
        channelId: 'channel',
      });
      expect(f.nativeStore.acknowledged).not.toHaveBeenCalled();
      expect(f.prisma.telegramManagedPost).not.toHaveProperty('updateMany');
    } finally {
      timeout.mockRestore();
    }
  });
  it('sanitizes decryption and account-resolution failures before transport', async () => {
    const f = fixture();
    f.access.accountCredentials.mockImplementation(() => {
      throw new Error('decryption private-session');
    });
    await expect(f.execute()).rejects.toThrow(
      'Telegram recovery transport failed; reconcile before retrying',
    );
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
    f.access.connectedAccount.mockRejectedValue(
      new Error('database credential URL'),
    );
    await expect(f.execute()).rejects.toThrow(
      'Telegram recovery transport failed; reconcile before retrying',
    );
  });
  it('fences a slow transport at claim expiry before its ordinary 60-second limit', async () => {
    jest.useFakeTimers();
    const f = fixture();
    f.post.deliveryClaimExpiresAt = new Date(Date.now() + 10_000);
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => {
        const c = new AbortController();
        setTimeout(() => c.abort(), ms);
        return c.signal;
      });
    f.mtproto.publishPost.mockImplementation(
      (params: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          params.signal.addEventListener(
            'abort',
            () => reject(new Error('late connection fenced')),
            { once: true },
          );
        }),
    );
    try {
      const result = f.execute();
      const rejection = expect(result).rejects.toThrow(
        'Telegram recovery transport cancelled or timed out; reconcile before retrying',
      );
      for (let i = 0; i < 40 && !f.mtproto.publishPost.mock.calls.length; i++)
        await Promise.resolve();
      expect(timeout).toHaveBeenLastCalledWith(10_000);
      await jest.advanceTimersByTimeAsync(10_001);
      await rejection;
    } finally {
      timeout.mockRestore();
      jest.useRealTimers();
    }
  });
  it('honors cancelled requests without issuing a Telegram call', async () => {
    const f = fixture();
    const c = new AbortController();
    c.abort();
    await expect(f.execute(f.request, c.signal)).rejects.toThrow();
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
  });
  it('reads one bounded history with no client-supplied message-ID probes', async () => {
    const f = fixture();
    const until = new Date().toISOString();
    const from = new Date(Date.now() - 86400_000).toISOString();
    await f.execute({
      operation: 'history',
      accountId: 'account',
      historyFrom: from,
      historyUntil: until,
    });
    expect(
      (f.mtproto.getManagedPostMessages.mock.calls as unknown[][])[0][0],
    ).toMatchObject({
      publishedMessageIds: [],
      scheduledMessageIds: [],
      recentPublishedFrom: new Date(from),
      recentPublishedUntil: new Date(until),
    });
  });
  it('refuses deletes outside stored IDs or original sender', async () => {
    const f = fixture();
    f.request.operation = 'delete';
    f.request.messageIds = ['99'];
    await expect(f.execute()).rejects.toBeInstanceOf(ConflictException);
    expect(f.mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });
  it('only accepts media already present on the stored post', async () => {
    const f = fixture();
    f.request.data!.imageUrls = ['http://127.0.0.1/private'];
    await expect(f.execute()).rejects.toBeInstanceOf(BadRequestException);
    expect(f.mtproto.publishPost).not.toHaveBeenCalled();
  });
});
