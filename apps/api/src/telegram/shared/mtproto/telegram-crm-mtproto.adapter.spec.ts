import { Api } from 'telegram';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
} from '@api/telegram/shared/mtproto/telegram-mtproto-session.factory';
import { TelegramCrmMtprotoAdapter } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.adapter';

jest.mock(
  '@api/telegram/shared/mtproto/telegram-mtproto-session.factory',
  () => ({
    createTelegramMtprotoSession: jest.fn(),
    closeTelegramMtprotoSession: jest.fn(),
  }),
);

describe('TelegramCrmMtprotoAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['filtered-only', 'oldest-filtered'])(
    'advances a full %s history page by raw Telegram IDs',
    async (kind) => {
      const privateMessage = (id: number) =>
        new Api.Message({
          id,
          peerId: new Api.PeerUser({ userId: 42 as never }),
          message: 'History text',
          date: 1,
        });
      const client = {
        getMessages: jest
          .fn()
          .mockResolvedValueOnce([
            kind === 'filtered-only'
              ? new Api.MessageEmpty({ id: 12 })
              : privateMessage(12),
            new Api.MessageEmpty({ id: 11 }),
          ])
          .mockResolvedValueOnce([privateMessage(10)]),
      };
      jest
        .mocked(createTelegramMtprotoSession)
        .mockResolvedValue(client as never);
      const handle = await new TelegramCrmMtprotoAdapter().open({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      });
      const page = await handle.getHistory({
        telegramUserId: '42',
        telegramAccessHash: '99',
        limit: 2,
      });
      expect(page).toMatchObject({
        exhausted: false,
        nextBeforeTelegramMessageId: 11,
      });
      expect(page.messages).toHaveLength(kind === 'filtered-only' ? 0 : 1);
      const next = await handle.getHistory({
        telegramUserId: '42',
        telegramAccessHash: '99',
        beforeTelegramMessageId: page.nextBeforeTelegramMessageId,
        limit: 2,
      });
      expect(next).toMatchObject({
        exhausted: true,
        nextBeforeTelegramMessageId: null,
        messages: [{ telegramMessageId: 10 }],
      });
      expect(client.getMessages).toHaveBeenLastCalledWith(expect.anything(), {
        limit: 2,
        offsetId: 11,
      });
    },
  );

  it.each([
    { ids: [0, -1], before: undefined },
    { ids: [12, 13], before: 12 },
  ])(
    'rejects a full history page that cannot advance its cursor %#',
    async ({ ids, before }) => {
      const client = {
        getMessages: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
      };
      jest
        .mocked(createTelegramMtprotoSession)
        .mockResolvedValue(client as never);
      const handle = await new TelegramCrmMtprotoAdapter().open({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      });
      await expect(
        handle.getHistory({
          telegramUserId: '42',
          telegramAccessHash: '99',
          beforeTelegramMessageId: before,
          limit: 2,
        }),
      ).rejects.toThrow('CRM_HISTORY_CURSOR_UNAVAILABLE');
      expect(client.getMessages).toHaveBeenCalledTimes(1);
    },
  );

  it('closes one opened transport exactly once even under concurrent cleanup', async () => {
    const client = {
      addEventHandler: jest.fn(),
      removeEventHandler: jest.fn(),
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);
    jest.mocked(closeTelegramMtprotoSession).mockResolvedValue(undefined);
    const adapter = new TelegramCrmMtprotoAdapter();

    const handle = await adapter.open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    await Promise.all([handle.close(), handle.close()]);

    expect(createTelegramMtprotoSession).toHaveBeenCalledWith(
      { apiId: '1', apiHash: 'hash', session: 'session' },
      undefined,
    );
    expect(closeTelegramMtprotoSession).toHaveBeenCalledTimes(1);
    expect(closeTelegramMtprotoSession).toHaveBeenCalledWith(client);
  });

  it('sends real reply IDs and refuses a missing original before SendMessage', async () => {
    const original = new Api.Message({
      id: 5,
      peerId: new Api.PeerUser({ userId: 42 as never }),
      message: 'original',
      date: 1,
    });
    const invoke = jest
      .fn<Promise<Api.TypeUpdates>, [Api.AnyRequest]>()
      .mockResolvedValue(
        new Api.UpdateShortSentMessage({ id: 6, pts: 1, ptsCount: 1, date: 2 }),
      );
    const client = {
      getMessages: jest.fn().mockResolvedValue([original]),
      invoke,
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);
    const handle = await new TelegramCrmMtprotoAdapter().open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    await handle.sendText({
      telegramUserId: '42',
      telegramAccessHash: '99',
      text: '||secret||',
      randomId: 123n,
      replyToTelegramMessageId: 5,
    });
    expect(invoke.mock.calls[0][0]).toMatchObject({
      className: 'messages.SendMessage',
      message: 'secret',
      replyTo: { replyToMsgId: 5 },
    });
    client.getMessages.mockResolvedValue([]);
    await expect(
      handle.sendText({
        telegramUserId: '42',
        telegramAccessHash: '99',
        text: 'reply',
        randomId: 124n,
        replyToTelegramMessageId: 5,
      }),
    ).rejects.toThrow('REPLY_MESSAGE_UNAVAILABLE');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('loads private users without GramJS migrated-dialog filtering and reports Telegram total', async () => {
    const user = new Api.User({
      id: 42 as never,
      accessHash: 420 as never,
      username: 'alice',
      firstName: 'Alice',
    });
    const message = new Api.Message({
      id: 7,
      peerId: new Api.PeerUser({ userId: 42 as never }),
      message: 'hello',
      date: 1_788_000_000,
    });
    const rows = Object.assign(
      [{ entity: user, message, id: 42, unreadCount: 3 }],
      { total: 17 },
    );
    const client = {
      getDialogs: jest.fn().mockResolvedValue(rows),
      invoke: jest
        .fn()
        .mockResolvedValue(new Api.messages.DialogFilters({ filters: [] })),
      addEventHandler: jest.fn(),
      removeEventHandler: jest.fn(),
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);
    const handle = await new TelegramCrmMtprotoAdapter().open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });

    await expect(
      handle.listPrivateDialogs({ limit: 100 }),
    ).resolves.toMatchObject({
      scanned: 1,
      total: 17,
      dialogs: [
        expect.objectContaining({
          peer: expect.objectContaining({ username: 'alice' }) as unknown,
        }),
      ],
    });
    expect(client.getDialogs).toHaveBeenCalledWith(
      expect.objectContaining({ offsetDate: undefined }),
    );
    expect(client.getDialogs).toHaveBeenCalledWith(
      expect.not.objectContaining({ ignoreMigrated: true }),
    );
  });

  it('maps an account dialog folder onto imported private dialogs', async () => {
    const user = new Api.User({
      id: 42 as never,
      accessHash: 420 as never,
      username: 'alice',
      contact: true,
    });
    const message = new Api.Message({
      id: 7,
      peerId: new Api.PeerUser({ userId: 42 as never }),
      message: 'hello',
      date: 1_788_000_000,
    });
    const folder = new Api.DialogFilter({
      id: 9,
      title: new Api.TextWithEntities({ text: 'Customers', entities: [] }),
      emoticon: '🤝',
      color: 3,
      contacts: true,
      pinnedPeers: [],
      includePeers: [],
      excludePeers: [],
    });
    const client = {
      getDialogs: jest.fn().mockResolvedValue(
        Object.assign([{ entity: user, message, id: 42, unreadCount: 0 }], {
          total: 1,
        }),
      ),
      invoke: jest
        .fn()
        .mockResolvedValue(
          new Api.messages.DialogFilters({ filters: [folder] }),
        ),
      addEventHandler: jest.fn(),
      removeEventHandler: jest.fn(),
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);

    const handle = await new TelegramCrmMtprotoAdapter().open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });

    await expect(
      handle.listPrivateDialogs({ limit: 100 }),
    ).resolves.toMatchObject({
      folders: [{ id: 9, title: 'Customers', emoticon: '🤝', color: 3 }],
      dialogs: [expect.objectContaining({ folderIds: [9] })],
    });
  });

  it('fails the import instead of silently omitting Telegram folder tags', async () => {
    const user = new Api.User({
      id: 42 as never,
      accessHash: 420 as never,
    });
    const client = {
      getDialogs: jest
        .fn()
        .mockResolvedValue(
          Object.assign([{ entity: user, id: 42 }], { total: 1 }),
        ),
      invoke: jest.fn().mockRejectedValue(new Error('FOLDER_FETCH_FAILED')),
      addEventHandler: jest.fn(),
      removeEventHandler: jest.fn(),
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);
    const handle = await new TelegramCrmMtprotoAdapter().open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });

    await expect(handle.listPrivateDialogs({ limit: 100 })).rejects.toThrow(
      'FOLDER_FETCH_FAILED',
    );
  });

  it('returns only eligible users referenced by normalized private updates', async () => {
    const difference = new Api.updates.Difference({
      newMessages: [
        new Api.Message({
          id: 101,
          peerId: new Api.PeerUser({ userId: 42 as never }),
          message: 'private',
          date: 1_788_000_000,
        }),
        new Api.Message({
          id: 102,
          peerId: new Api.PeerChannel({ channelId: 900 as never }),
          message: 'channel',
          date: 1_788_000_001,
        }),
      ],
      newEncryptedMessages: [],
      otherUpdates: [
        new Api.UpdateReadHistoryInbox({
          peer: new Api.PeerChat({ chatId: 700 as never }),
          maxId: 90,
          stillUnreadCount: 0,
          pts: 11,
          ptsCount: 1,
        }),
      ],
      chats: [],
      users: [
        new Api.User({
          id: 42 as never,
          accessHash: 420 as never,
          username: 'referenced',
        }),
        new Api.User({
          id: 43 as never,
          accessHash: 430 as never,
          username: 'eligible_but_unreferenced',
        }),
        new Api.User({
          id: 44 as never,
          accessHash: 440 as never,
          username: 'bot_user',
          bot: true,
        }),
      ],
      state: new Api.updates.State({
        pts: 12,
        qts: 0,
        date: 1_788_000_002,
        seq: 5,
        unreadCount: 0,
      }),
    });
    const client = {
      invoke: jest.fn().mockResolvedValue(difference),
      addEventHandler: jest.fn(),
      removeEventHandler: jest.fn(),
    };
    jest
      .mocked(createTelegramMtprotoSession)
      .mockResolvedValue(client as never);
    jest.mocked(closeTelegramMtprotoSession).mockResolvedValue(undefined);
    const adapter = new TelegramCrmMtprotoAdapter();
    const handle = await adapter.open({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });

    const result = await handle.getDifference({
      pts: 10,
      qts: 0,
      date: 1_787_999_999,
      seq: 4,
    });

    expect(result.peers).toEqual([
      expect.objectContaining({
        telegramUserId: '42',
        username: 'referenced',
      }),
    ]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({
      type: 'message.new',
      message: { telegramUserId: '42' },
    });
    await handle.close();
  });
});
