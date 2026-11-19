import {
  assertRescheduleActive,
  cancelPreviousNativeSchedule,
  rescheduleContext,
  loadTelegramPublishedHistory,
  loadTelegramScheduledQueues,
  type ReschedulerAccountContext,
} from './telegram-managed-post-rescheduler.remote';

type Dependencies = Parameters<typeof loadTelegramScheduledQueues>[0];
const now = new Date('2026-11-19T09:00:00Z');
const channelReference = {
  username: null,
  inviteLink: null,
  telegramChatId: '-100123',
  telegramAccessHash: 'hash',
};
const credentials = { apiId: '1', apiHash: 'hash', session: 'reader-session' };
const history = {
  published: [],
  recentPublished: [{ id: 'published-id' }],
  scheduled: [],
};
function post(index: number, sourceId = 'sender') {
  return {
    sourceId,
    text: 'A useful scheduled post',
    imageUrls: [] as string[],
    mediaItems: [],
    scheduleMode: 'TELEGRAM_NATIVE',
    scheduledAt: new Date(now.getTime() - (index + 1) * 60_000),
    telegramScheduledMessageIds: [`scheduled-${index}`],
  };
}
function harness() {
  const access = {
    connectedAccount: jest.fn().mockResolvedValue({ id: 'sender' }),
    accountCredentials: jest.fn().mockReturnValue(credentials),
  };
  const recoveryAccess = {
    ...access,
    connectedRecoveryAccount: (workspace: string, channel: string) =>
      access.connectedAccount(workspace, channel, undefined),
  };
  const mtprotoClient = {
    getScheduledHistory: jest.fn().mockResolvedValue([{ id: 'scheduled-1' }]),
    getScheduledMessagesByIds: jest.fn(),
    getManagedPostMessages: jest.fn().mockResolvedValue(history),
  };
  return {
    access,
    mtprotoClient,
    deps: { access: recoveryAccess, mtprotoClient } as unknown as Dependencies,
  };
}
const queueInput = (
  posts = Array.from({ length: 72 }, (_, index) => post(index)),
) => ({
  workspaceId: 'workspace',
  channelId: 'channel',
  channelReference,
  posts,
  total: posts.length,
});

describe('rescheduler request-scoped Telegram snapshots', () => {
  it('compares 72 posts against one complete original-sender queue and one published history', async () => {
    const h = harness();
    const input = queueInput();
    const onProgress = jest.fn();
    Object.assign(input, { onProgress });
    const queues = await loadTelegramScheduledQueues(h.deps, input);
    expect(onProgress.mock.calls.every(([, current]) => current === 0)).toBe(
      true,
    );
    expect(queues.remoteScheduledCount).toBe(1);
    expect(queues.accountContexts.get('sender')!.scheduledMessages).toEqual([
      { id: 'scheduled-1' },
    ]);
    expect([...queues.accountContexts.get('sender')!.scheduledIds]).toEqual([
      'scheduled-1',
    ]);
    expect(h.access.connectedAccount).toHaveBeenCalledWith(
      'workspace',
      'channel',
      'sender',
    );
    expect(h.mtprotoClient.getScheduledHistory).toHaveBeenCalledTimes(1);
    expect(h.mtprotoClient.getScheduledMessagesByIds).not.toHaveBeenCalled();
    const published = await loadTelegramPublishedHistory(h.deps, {
      channelReference,
      overduePosts: input.posts,
      accountContexts: queues.accountContexts,
      now,
      total: 72,
    });
    expect(published.publishedByAccount.get('sender')).toBe(history);
    expect(published.publishedHistoryErrors.size).toBe(0);
    expect(h.mtprotoClient.getManagedPostMessages).toHaveBeenCalledTimes(1);
    expect(h.mtprotoClient.getManagedPostMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedMessageIds: [],
        scheduledMessageIds: [],
        recentPublishedUntil: now,
        recentPublishedFrom: new Date(
          input.posts[71].scheduledAt.getTime() - 6 * 60 * 60_000,
        ),
      }),
    );
  });

  it('retains original queue errors even when an alternate reader can inspect published history', async () => {
    const h = harness();
    h.mtprotoClient.getScheduledHistory.mockRejectedValue(
      new Error('sender queue unavailable'),
    );
    const input = queueInput([post(0)]);
    const queues = await loadTelegramScheduledQueues(h.deps, input);
    expect(queues.accountContexts.get('sender')).toEqual({
      credentials,
      scheduledIds: new Set(),
      error: 'sender queue unavailable',
    });
    expect(h.access.connectedAccount).toHaveBeenCalledWith(
      'workspace',
      'channel',
      undefined,
    );
    const published = await loadTelegramPublishedHistory(h.deps, {
      channelReference,
      overduePosts: input.posts,
      accountContexts: queues.accountContexts,
      now,
      total: 1,
    });
    expect(published.publishedByAccount.get('sender')).toBe(history);
    expect(queues.accountContexts.get('sender')!.error).toBe(
      'sender queue unavailable',
    );
  });

  it('reads an alternate reader once to confirm known IDs without replacing original absence evidence', async () => {
    const h = harness();
    h.access.connectedAccount.mockImplementation(
      (_workspace: string, _channel: string, accountId?: string) =>
        Promise.resolve({
          id: accountId || 'alternate',
        }),
    );
    h.access.accountCredentials.mockImplementation(
      (account: { id: string }) => ({
        ...credentials,
        session: account.id,
      }),
    );
    const confirmation = [{ id: 'scheduled-0' }];
    h.mtprotoClient.getScheduledHistory.mockImplementation(
      (params: { session: string }) => {
        if (params.session === 'alternate')
          return Promise.resolve(confirmation);
        return Promise.reject(new Error('original unavailable'));
      },
    );
    const result = await loadTelegramScheduledQueues(
      h.deps,
      queueInput([post(0, 'first'), post(1, 'second')]),
    );
    for (const accountId of ['first', 'second']) {
      const context = result.accountContexts.get(accountId)!;
      expect(context.error).toBe('original unavailable');
      expect(context.scheduledIds.size).toBe(0);
      expect(context.scheduledMessages).toBeUndefined();
      expect(context.confirmationOnlyScheduledMessages).toBe(confirmation);
    }
    expect(
      h.mtprotoClient.getScheduledHistory.mock.calls.filter(
        ([params]: [{ session: string }]) => params.session === 'alternate',
      ),
    ).toHaveLength(1);
  });

  it('confirms all future native posts through one linked reader without opening an inaccessible original sender', async () => {
    const h = harness();
    h.access.connectedAccount.mockImplementation(
      (_workspace: string, _channel: string, accountId?: string) => {
        if (accountId)
          return Promise.reject(new Error('original must not be opened'));
        return Promise.resolve({ id: 'priority-reader' });
      },
    );
    const future = new Date(Date.now() + 86_400_000);
    const posts = Array.from({ length: 45 }, (_, index) => ({
      ...post(index, 'inaccessible-original'),
      scheduledAt: future,
    }));
    const messages = posts.map((item) => ({
      id: item.telegramScheduledMessageIds[0],
      text: item.text,
      date: future.toISOString(),
      hasMedia: false,
    }));
    h.mtprotoClient.getScheduledHistory.mockResolvedValue(messages);
    const result = await loadTelegramScheduledQueues(h.deps, queueInput(posts));
    expect(h.access.connectedAccount).toHaveBeenCalledTimes(1);
    expect(h.mtprotoClient.getScheduledHistory).toHaveBeenCalledTimes(1);
    expect(result.accountContexts.get('inaccessible-original')).toMatchObject({
      scheduledIds: new Set(),
      error: 'Original sender queue not read; positive confirmation only',
      confirmationOnlyScheduledMessages: messages,
    });
    expect(result.remoteScheduledCount).toBe(45);
  });

  it.each(['missing', 'wrong-text'])(
    'still reads the original sender when positive reader confirmation is %s',
    async (failure) => {
      const h = harness();
      h.access.connectedAccount.mockImplementation(
        (_workspace: string, _channel: string, accountId?: string) =>
          Promise.resolve({ id: accountId || 'priority-reader' }),
      );
      h.access.accountCredentials.mockImplementation(
        (account: { id: string }) => ({ ...credentials, session: account.id }),
      );
      const future = new Date(Date.now() + 86_400_000);
      h.mtprotoClient.getScheduledHistory.mockImplementation(
        (params: { session: string }) => {
          if (params.session !== 'priority-reader')
            return Promise.reject(new Error('original unavailable'));
          return Promise.resolve(
            failure === 'missing'
              ? []
              : [
                  {
                    id: 'scheduled-0',
                    text:
                      failure === 'wrong-text'
                        ? 'unrelated'
                        : 'A useful scheduled post',
                    date: future.toISOString(),
                    hasMedia: false,
                  },
                ],
          );
        },
      );
      const result = await loadTelegramScheduledQueues(
        h.deps,
        queueInput([{ ...post(0), scheduledAt: future }]),
      );
      expect(h.mtprotoClient.getScheduledHistory).toHaveBeenCalledTimes(2);
      expect(result.accountContexts.get('sender')).toMatchObject({
        scheduledIds: new Set(),
        error: 'original unavailable',
      });
      expect(
        result.accountContexts.get('sender')!.scheduledMessages,
      ).toBeUndefined();
    },
  );

  it('does not retry the same failed physical reader as an alternate queue', async () => {
    const h = harness();
    h.mtprotoClient.getScheduledHistory.mockRejectedValue(
      new Error('queue unavailable'),
    );
    await loadTelegramScheduledQueues(h.deps, queueInput([post(0)]));
    expect(h.mtprotoClient.getScheduledHistory).toHaveBeenCalledTimes(1);
  });

  it('reuses history for the same fallback reader without sharing sender queues', async () => {
    const h = harness();
    const contexts = new Map<string, ReschedulerAccountContext>([
      [
        'first',
        {
          credentials: { ...credentials },
          scheduledIds: new Set(['first-id']),
        },
      ],
      [
        'second',
        {
          credentials: { ...credentials },
          scheduledIds: new Set(['second-id']),
          error: 'queue denied',
        },
      ],
    ]);
    const result = await loadTelegramPublishedHistory(h.deps, {
      channelReference,
      overduePosts: [post(0, 'first'), post(1, 'second')],
      accountContexts: contexts,
      now,
      total: 2,
    });
    expect(result.publishedByAccount.get('first')).toBe(
      result.publishedByAccount.get('second'),
    );
    expect(h.mtprotoClient.getManagedPostMessages).toHaveBeenCalledTimes(1);
    expect([...contexts.get('first')!.scheduledIds]).toEqual(['first-id']);
    expect([...contexts.get('second')!.scheduledIds]).toEqual(['second-id']);
  });

  it('reports a shared history failure for every affected sender without repeating the failed read', async () => {
    const h = harness();
    h.mtprotoClient.getManagedPostMessages.mockRejectedValue(
      new Error('history unavailable'),
    );
    const contexts = new Map<string, ReschedulerAccountContext>([
      ['first', { credentials, scheduledIds: new Set() }],
      ['second', { credentials, scheduledIds: new Set() }],
    ]);
    const result = await loadTelegramPublishedHistory(h.deps, {
      channelReference,
      overduePosts: [post(0, 'first'), post(1, 'second')],
      accountContexts: contexts,
      now,
      total: 2,
    });
    expect([...result.publishedHistoryErrors.entries()]).toEqual([
      ['first', 'history unavailable'],
      ['second', 'history unavailable'],
    ]);
    expect(h.mtprotoClient.getManagedPostMessages).toHaveBeenCalledTimes(1);
    expect(result.publishedByAccount.size).toBe(0);
  });

  it('performs no remote work for future LOCAL posts or an empty overdue set', async () => {
    const h = harness();
    await loadTelegramScheduledQueues(
      h.deps,
      queueInput([
        {
          ...post(0),
          scheduleMode: 'LOCAL',
          scheduledAt: new Date(Date.now() + 86_400_000),
        },
      ]),
    );
    await loadTelegramPublishedHistory(h.deps, {
      channelReference,
      overduePosts: [],
      accountContexts: new Map(),
      now,
      total: 1,
    });
    expect(h.access.connectedAccount).not.toHaveBeenCalled();
    expect(h.mtprotoClient.getScheduledHistory).not.toHaveBeenCalled();
    expect(h.mtprotoClient.getManagedPostMessages).not.toHaveBeenCalled();
  });
});

describe('native reschedule deadline admission', () => {
  it('does not delete schedule IDs proven absent for this claimed post', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const deleteScheduledPost = jest.fn();
    const connectedAccount = jest.fn();
    const onCancel = jest.fn();
    const result = await rescheduleContext.run(
      {
        owner: 'owner',
        signal: new AbortController().signal,
        confirmedMissingScheduleFor: 'post',
      },
      () =>
        cancelPreviousNativeSchedule(
          {
            prisma: { telegramManagedPost: { count } } as never,
            access: { connectedAccount } as never,
            mtprotoClient: { deleteScheduledPost } as never,
          },
          {
            workspaceId: 'workspace',
            channelId: 'channel',
            channel: channelReference,
            post: {
              id: 'post',
              status: 'SCHEDULED',
              sourceId: 'sender',
              sourceType: 'MTPROTO',
              telegramScheduledMessageIds: ['absent-id'],
            },
            sourceId: 'sender',
            account: {} as never,
            onCancel,
          },
        ),
    );
    expect(result).toBe(false);
    expect(count).toHaveBeenCalledTimes(1);
    expect(deleteScheduledPost).not.toHaveBeenCalled();
    expect(connectedAccount).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('rejects an elapsed target before reading ownership', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { telegramManagedPost: { count } };
    await expect(
      rescheduleContext.run(
        {
          owner: 'owner',
          signal: new AbortController().signal,
          scheduledAt: new Date(Date.now() - 1000),
        },
        () => assertRescheduleActive(prisma as never, 'post'),
      ),
    ).rejects.toThrow('time has elapsed');
    expect(count).not.toHaveBeenCalled();
  });

  it('rejects when target time elapses while ownership verification is pending', async () => {
    const scheduledAt = new Date(Date.now() + 60_000);
    const count = jest.fn().mockImplementation(() => {
      scheduledAt.setTime(Date.now() - 1000);
      return Promise.resolve(1);
    });
    const prisma = { telegramManagedPost: { count } };
    await expect(
      rescheduleContext.run(
        { owner: 'owner', signal: new AbortController().signal, scheduledAt },
        () => assertRescheduleActive(prisma as never, 'post'),
      ),
    ).rejects.toThrow('time has elapsed');
    expect(count).toHaveBeenCalledTimes(1);
  });
});
