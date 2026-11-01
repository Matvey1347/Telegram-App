import { Api } from 'telegram';
import { FloodWaitError } from 'telegram/errors';
import { TelegramLeadChannelReader } from './telegram-lead-channel-reader';
import {
  normalizeTelegramLeadRaw,
  parseTelegramLeadPost,
} from './telegram-lead-channel-normalizer';
const channelId = '101';
const post = (id = 7, text = 'Business offer', channel = channelId) =>
  new Api.Message({
    id,
    peerId: new Api.PeerChannel({ channelId: channel as never }),
    message: text,
    date: 1_788_000_000,
  });
const setup = () => {
  const client = {
    getInputEntity: jest.fn().mockResolvedValue(
      new Api.InputPeerChannel({
        channelId: channelId as never,
        accessHash: '202' as never,
      }),
    ),
    invoke: jest.fn(),
    getDialogs: jest.fn(),
    getMessages: jest.fn(),
    getEntity: jest.fn(),
    addEventHandler: jest.fn(),
    removeEventHandler: jest.fn(),
  };
  return { client, reader: new TelegramLeadChannelReader(client as never) };
};
describe('shared live-handle channel read transport (mocked Telegram only)', () => {
  it('does no startup/network work and never joins or opens a client', () => {
    const { client } = setup();
    expect(client.invoke).not.toHaveBeenCalled();
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(client.getDialogs).not.toHaveBeenCalled();
  });
  it('resolves an invite only through existing membership without joining', async () => {
    const { client, reader } = setup();
    const channel = new Api.Channel({
      id: channelId as never,
      accessHash: '202' as never,
      title: 'Private source',
      broadcast: true,
      photo: new Api.ChatPhotoEmpty(),
      date: 1,
    });
    client.invoke
      .mockResolvedValueOnce(new Api.ChatInviteAlready({ chat: channel }))
      .mockResolvedValueOnce({ fullChat: {} });
    expect(
      await reader.resolve('https://t.me/+synthetic_private-source'),
    ).toMatchObject({ channelId, title: 'Private source' });
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(client.invoke).toHaveBeenNthCalledWith(
      1,
      expect.any(Api.messages.CheckChatInvite),
    );
    expect(client.invoke).not.toHaveBeenCalledWith(
      expect.any(Api.messages.ImportChatInvite),
    );
  });
  it('refuses an invite without current membership and never imports it', async () => {
    const { client, reader } = setup();
    client.invoke.mockResolvedValue({ title: 'Preview only' });
    await expect(
      reader.resolve('https://t.me/+synthetic_unjoined-source'),
    ).rejects.toThrow('LEAD_CHANNEL_MEMBERSHIP_REQUIRED');
    expect(client.invoke).toHaveBeenCalledTimes(1);
    expect(client.getEntity).not.toHaveBeenCalled();
  });
  it('maps a real GramJS flood-wait error without reporting source access lost', async () => {
    const { client, reader } = setup();
    client.getEntity.mockRejectedValue(new FloodWaitError({ capture: 30 }));
    await expect(reader.resolve('@synthetic_source')).rejects.toThrow(
      'LEAD_TELEGRAM_RATE_LIMITED',
    );
    expect(client.getEntity).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['INVITE_HASH_EXPIRED', 'LEAD_INVITE_INVALID'],
    ['USERNAME_NOT_OCCUPIED', 'LEAD_CHANNEL_NOT_FOUND'],
    ['CHANNEL_PRIVATE', 'LEAD_CHANNEL_ACCESS_DENIED'],
    ['FLOOD_WAIT_30', 'LEAD_TELEGRAM_RATE_LIMITED'],
  ])(
    'maps %s to a safe source reason without leaking references',
    async (telegramError, safeCode) => {
      const { client, reader } = setup();
      client.getEntity.mockRejectedValue(
        new Error(`${telegramError}: private-reference`),
      );
      await expect(reader.resolve('@synthetic_source')).rejects.toThrow(
        safeCode,
      );
      expect(client.invoke).not.toHaveBeenCalled();
    },
  );
  it('isolates broadcast messages from private CRM events and carries edit/delete pts', () => {
    expect(
      parseTelegramLeadPost(
        new Api.Message({
          id: 1,
          peerId: new Api.PeerUser({ userId: '2' as never }),
          message: 'private',
          date: 123,
        }),
      ),
    ).toBeNull();
    const edited = new Api.UpdateEditChannelMessage({
      message: post(),
      pts: 4,
      ptsCount: 1,
    });
    expect(normalizeTelegramLeadRaw(edited)).toMatchObject([
      {
        type: 'post.edited',
        pts: 4,
        ptsCount: 1,
        post: { channelId, messageId: 7 },
      },
    ]);
    expect(
      normalizeTelegramLeadRaw(
        new Api.UpdateDeleteChannelMessages({
          channelId: channelId as never,
          messages: [7, 8],
          pts: 5,
          ptsCount: 1,
        }),
      ),
    ).toMatchObject([{ type: 'post.deleted', messageIds: [7, 8], pts: 5 }]);
  });
  it('recovers missed edits and deletion ordering before advancing channel pts', async () => {
    const { client, reader } = setup();
    client.invoke.mockResolvedValue(
      new Api.updates.ChannelDifference({
        final: true,
        pts: 12,
        newMessages: [post(7, 'old content'), post(8, 'deleted later')],
        otherUpdates: [
          new Api.UpdateEditChannelMessage({
            message: post(7, 'edited business contact @example_business'),
            pts: 11,
            ptsCount: 1,
          }),
          new Api.UpdateDeleteChannelMessages({
            channelId: channelId as never,
            messages: [8],
            pts: 12,
            ptsCount: 1,
          }),
        ],
        chats: [],
        users: [],
      }),
    );
    const result = await reader.recover(channelId, 10);
    expect(result).toMatchObject({
      pts: 12,
      final: true,
      tooLong: false,
      deletedIds: [8],
      posts: [
        { messageId: 7, text: 'edited business contact @example_business' },
      ],
    });
    expect(client.invoke).toHaveBeenCalledTimes(1);
  });
  it('keeps a too-long difference explicitly incomplete without pretending to restore content', async () => {
    const { client, reader } = setup();
    client.invoke.mockResolvedValue(
      new Api.updates.ChannelDifferenceTooLong({
        final: true,
        dialog: new Api.Dialog({
          peer: new Api.PeerChannel({ channelId: channelId as never }),
          topMessage: 20,
          readInboxMaxId: 0,
          readOutboxMaxId: 0,
          unreadCount: 0,
          unreadMentionsCount: 0,
          unreadReactionsCount: 0,
          notifySettings: new Api.PeerNotifySettings({}),
          pts: 30,
        }),
        messages: [],
        chats: [],
        users: [],
      }),
    );
    expect(await reader.recover(channelId, 10)).toMatchObject({
      tooLong: true,
      final: false,
      pts: 30,
      posts: [],
    });
  });
  it('bounds history on the same client and cannot leak another channel messages', async () => {
    const { client, reader } = setup();
    client.getMessages.mockResolvedValue([post(9), post(8, 'foreign', '999')]);
    const page = await reader.history(channelId, { limit: 999 });
    expect(page.items).toHaveLength(1);
    const calls = client.getMessages.mock.calls as unknown as Array<
      [unknown, { limit: number }]
    >;
    expect(calls[0]?.[1]).toMatchObject({ limit: 100 });
    await expect(
      reader.history('https://unapproved.example', {}),
    ).rejects.toThrow('LEAD_CHANNEL_ID_INVALID');
  });
  it('rejects stale/foreign cursors without a Telegram request and detaches its single listener', async () => {
    const { client, reader } = setup();
    await expect(reader.list({ cursor: 'unknown' })).rejects.toThrow(
      'LEAD_CHANNEL_CURSOR_EXPIRED',
    );
    expect(client.getDialogs).not.toHaveBeenCalled();
    const detach = reader.onEvent(jest.fn());
    expect(client.addEventHandler).toHaveBeenCalledTimes(1);
    detach();
    expect(client.removeEventHandler).toHaveBeenCalledTimes(1);
  });
  const entity = (id: string) =>
    new Api.Channel({
      id: id as never,
      accessHash: '202' as never,
      title: 'Permitted broadcast',
      photo: new Api.ChatPhotoEmpty(),
      date: 1,
      broadcast: true,
    });
  it('warms a cold public peer by stored username and verifies immutable channel identity', async () => {
    const { client, reader } = setup();
    client.getInputEntity.mockRejectedValue(new Error('cold cache'));
    client.getEntity.mockResolvedValue(entity(channelId));
    client.getMessages.mockResolvedValue([post()]);
    expect(
      (await reader.history(channelId, { reference: 'permitted_channel' }))
        .items,
    ).toHaveLength(1);
    await reader.history(channelId, {});
    expect(client.getEntity).toHaveBeenCalledTimes(1);
    expect(client.getDialogs).not.toHaveBeenCalled();
    const other = setup();
    other.client.getInputEntity.mockRejectedValue(new Error('cold cache'));
    other.client.getEntity.mockResolvedValue(entity('999'));
    await expect(
      other.reader.history(channelId, { reference: 'reassigned_channel' }),
    ).rejects.toThrow('LEAD_SOURCE_IDENTITY_CHANGED');
    expect(other.client.getMessages).not.toHaveBeenCalled();
  });
  it('shares one bounded private-dialog warmup and reports channels outside that page as unavailable', async () => {
    const { client, reader } = setup();
    client.getInputEntity.mockRejectedValue(new Error('cold cache'));
    client.getDialogs.mockResolvedValue([{ entity: entity(channelId) }]);
    client.getMessages.mockResolvedValue([]);
    await reader.history(channelId, {});
    await expect(reader.history('999', {})).rejects.toThrow(
      'LEAD_CHANNEL_ACCESS_UNAVAILABLE',
    );
    expect(client.getDialogs).toHaveBeenCalledTimes(1);
    expect(client.getDialogs).toHaveBeenCalledWith({ limit: 100 });
    expect(client.invoke).not.toHaveBeenCalled();
  });
});
