import { Api } from 'telegram';
import {
  closeTelegramMtprotoSession,
  createTelegramMtprotoSession,
} from './telegram-mtproto-session.factory';
import { TelegramCrmMtprotoAdapter } from './telegram-crm-mtproto.adapter';

jest.mock('./telegram-mtproto-session.factory', () => ({
  createTelegramMtprotoSession: jest.fn(),
  closeTelegramMtprotoSession: jest.fn(),
}));

describe('TelegramCrmMtprotoAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

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
