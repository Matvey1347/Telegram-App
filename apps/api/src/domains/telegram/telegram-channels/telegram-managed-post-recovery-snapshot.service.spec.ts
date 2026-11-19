import { TelegramManagedPostRecoverySnapshotService } from './telegram-managed-post-recovery-snapshot.service';

const message = (id: string) => ({
  id,
  text: `Body ${id}`,
  date: '2026-11-19T08:00:00Z',
  hasMedia: true,
  groupedId: 'album',
  html: '<b>Body</b>',
  mediaKind: 'PHOTO',
});
function harness() {
  const oldest = new Date('2026-11-03T08:00:00Z');
  const accounts = ['first', 'second', 'third'].map((id) => ({
    id,
    apiId: id,
  }));
  const prisma = {
    telegramChannel: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'channel', telegramChatId: '-100123' }),
    },
    telegramChannelAdminLink: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          accounts.map((account) => ({
            telegramUserAccountIntegration: account,
          })),
        ),
    },
    telegramManagedPost: {
      aggregate: jest.fn().mockResolvedValue({ _min: { createdAt: oldest } }),
    },
  };
  const transport = {
    getScheduledHistory: jest
      .fn()
      .mockImplementation(({ apiId }: { apiId: string }) =>
        Promise.resolve([message(`queue-${apiId}`)]),
      ),
    getManagedPostMessages: jest
      .fn()
      .mockResolvedValue({
        published: [],
        scheduled: [],
        recentPublished: [message('published')],
        recentPublishedComplete: true,
      }),
  };
  const support = { workspace: jest.fn().mockResolvedValue('workspace') };
  const access = {
    mtprotoChannelReference: jest
      .fn()
      .mockReturnValue({ telegramChatId: '-100123' }),
    accountCredentials: jest
      .fn()
      .mockImplementation(({ apiId }: { apiId: string }) => ({
        apiId,
        apiHash: 'private-hash',
        session: 'private-session',
      })),
  };
  const service = new TelegramManagedPostRecoverySnapshotService(
    prisma as never,
    transport as never,
    support as never,
    access as never,
  );
  return { service, prisma, transport, access, oldest };
}

describe('read-only Telegram recovery snapshot', () => {
  it('reads every linked sender queue once and one shared published history without importing media', async () => {
    const h = harness();
    const result = await h.service.snapshot('user', 'channel');
    expect(
      result.accounts.map((account) => [
        account.accountId,
        account.scheduledMessages[0].id,
      ]),
    ).toEqual([
      ['first', 'queue-first'],
      ['second', 'queue-second'],
      ['third', 'queue-third'],
    ]);
    expect(h.transport.getScheduledHistory).toHaveBeenCalledTimes(3);
    expect(h.transport.getManagedPostMessages).toHaveBeenCalledTimes(1);
    expect(h.transport.getManagedPostMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedMessageIds: [],
        scheduledMessageIds: [],
        recentPublishedFrom: h.oldest,
      }),
    );
    expect(result.publishedMessages).toEqual([
      {
        id: 'published',
        text: 'Body published',
        date: '2026-11-19T08:00:00Z',
        hasMedia: true,
        groupedId: 'album',
      },
    ]);
    expect(result.publishedHistoryComplete).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /private-hash|private-session|html|mediaKind/,
    );
    expect(h.prisma.telegramChannelAdminLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          telegramUserAccountIntegration: {
            workspaceId: 'workspace',
            isActive: true,
            status: 'connected',
          },
        },
      }),
    );
    expect(h.prisma.telegramManagedPost.aggregate).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        status: { in: ['SCHEDULED', 'FAILED'] },
      },
      _min: { createdAt: true },
    });
  });

  it('reports a sender queue failure explicitly and still inspects the other accounts', async () => {
    const h = harness();
    h.transport.getScheduledHistory.mockRejectedValueOnce(
      new Error('SECRET transport details private-session'),
    );
    const result = await h.service.snapshot('user', 'channel');
    expect(result.accounts[0]).toEqual({
      accountId: 'first',
      scheduledMessages: [],
      error:
        'Telegram scheduled queue could not be read; absence is unverified.',
    });
    expect(result.accounts[1].scheduledMessages).toHaveLength(1);
    expect(h.transport.getScheduledHistory).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private-session/);
  });

  it('rejects an inaccessible workspace channel before reading accounts or Telegram', async () => {
    const h = harness();
    h.prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(
      h.service.snapshot('foreign-user', 'channel'),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel', workspaceId: 'workspace', isActive: true },
      }),
    );
    expect(h.prisma.telegramChannelAdminLink.findMany).not.toHaveBeenCalled();
    expect(h.transport.getScheduledHistory).not.toHaveBeenCalled();
  });

  it('preserves an incomplete history flag instead of treating truncation as absence', async () => {
    const h = harness();
    h.transport.getManagedPostMessages.mockResolvedValue({
      published: [],
      scheduled: [],
      recentPublished: [message('published')],
      recentPublishedComplete: false,
    });
    const result = await h.service.snapshot('user', 'channel');
    expect(result.publishedMessages).toHaveLength(1);
    expect(result.publishedHistoryComplete).toBe(false);
  });

  it('falls back to a seven-day observation when no scheduled or failed candidate exists', async () => {
    const h = harness();
    h.prisma.telegramManagedPost.aggregate.mockResolvedValue({
      _min: { createdAt: null },
    });
    await h.service.snapshot('user', 'channel');
    const input = h.transport.getManagedPostMessages.mock.calls[0][0] as {
      recentPublishedFrom: Date;
      recentPublishedUntil: Date;
    };
    expect(
      input.recentPublishedUntil.getTime() -
        input.recentPublishedFrom.getTime(),
    ).toBe(7 * 86_400_000);
  });

  it('returns an explicit history error when there is no connected reader', async () => {
    const h = harness();
    h.prisma.telegramChannelAdminLink.findMany.mockResolvedValue([]);
    const result = await h.service.snapshot('user', 'channel');
    expect(result.accounts).toEqual([]);
    expect(result.publishedHistoryComplete).toBe(false);
    expect(result.publishedHistoryError).toBeDefined();
    expect(h.transport.getManagedPostMessages).not.toHaveBeenCalled();
  });
});
