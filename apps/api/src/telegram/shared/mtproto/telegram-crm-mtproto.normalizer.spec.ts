import { BadRequestException } from '@nestjs/common';
import { Api } from 'telegram';
import {
  decodeTelegramCrmDialogCursor,
  encodeTelegramCrmDialogCursor,
  normalizeTelegramCrmRaw,
  parseTelegramCrmPeer,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.normalizer';

describe('Telegram CRM MTProto normalizer', () => {
  it('keeps Telegram long identifiers as lossless strings', () => {
    const peer = parseTelegramCrmPeer(
      new Api.User({
        id: BigInt('9007199254740993123') as never,
        accessHash: BigInt('9007199254740993987') as never,
        username: 'updated_name',
      }),
    );

    expect(peer).toMatchObject({
      telegramUserId: '9007199254740993123',
      telegramAccessHash: '9007199254740993987',
      username: 'updated_name',
    });
  });

  it.each([
    { id: 777000, accessHash: 1 },
    { id: 10, accessHash: 1, bot: true },
    { id: 11, accessHash: 1, self: true },
    { id: 12, accessHash: 1, deleted: true },
    { id: 13, accessHash: 1, support: true },
  ])('excludes service and non-private CRM users: %j', (input) => {
    expect(parseTelegramCrmPeer(new Api.User(input as never))).toBeNull();
  });

  it('normalizes the explicit gap signal and ignores short chat updates', () => {
    expect(normalizeTelegramCrmRaw(new Api.UpdatesTooLong())).toEqual([
      { type: 'sync.gap', reason: 'UPDATES_TOO_LONG' },
    ]);
    expect(
      normalizeTelegramCrmRaw(
        new Api.UpdateShortChatMessage({
          id: 1,
          fromId: 2 as never,
          chatId: 3 as never,
          message: 'group',
          pts: 4,
          ptsCount: 1,
          date: 5,
        }),
      ),
    ).toEqual([]);
  });

  it('round-trips offset peer cursor fields and rejects malformed cursors', () => {
    const cursor = {
      offsetDate: 10,
      offsetId: 20,
      offsetUserId: '9007199254740993',
      offsetAccessHash: '9007199254740997',
    };
    expect(
      decodeTelegramCrmDialogCursor(encodeTelegramCrmDialogCursor(cursor)),
    ).toEqual(cursor);
    expect(() => decodeTelegramCrmDialogCursor('not-json')).toThrow(
      BadRequestException,
    );
  });
});

describe('CRM live peer eligibility metadata', () => {
  it('uses the raw users policy and a bounded known-user cache without dropping absent or incomplete legitimate users', () => {
    const excluded = new Set<string>();
    const message = (id: number) =>
      new Api.UpdateNewMessage({
        message: new Api.Message({
          id,
          peerId: new Api.PeerUser({ userId: id as never }),
          message: 'Private message',
          date: 1,
        }),
        pts: id,
        ptsCount: 1,
      });
    const raw = new Api.Updates({
      updates: [message(42), message(51), message(52), message(53)],
      chats: [],
      date: 1,
      seq: 1,
      users: [
        new Api.User({ id: 42 as never, accessHash: 420 as never, bot: true }),
        new Api.User({ id: 52 as never }),
        new Api.UserEmpty({ id: 53 as never }),
      ],
    });
    expect(normalizeTelegramCrmRaw(raw, excluded)).toHaveLength(3);
    expect(normalizeTelegramCrmRaw(message(42), excluded)).toEqual([]);
    expect(normalizeTelegramCrmRaw(message(777000), excluded)).toEqual([]);
    const many = new Api.Updates({
      updates: [message(10000)],
      chats: [],
      date: 2,
      seq: 2,
      users: Array.from(
        { length: 1100 },
        (_, index) =>
          new Api.User({
            id: (10000 + index) as never,
            accessHash: index as never,
            bot: true,
          }),
      ),
    });
    expect(normalizeTelegramCrmRaw(many, excluded)).toEqual([]);
    expect(excluded.size).toBeLessThanOrEqual(1024);
    expect(normalizeTelegramCrmRaw(message(777000), excluded)).toEqual([]);
    expect(normalizeTelegramCrmRaw(message(51), excluded)).toHaveLength(1);
  });
});

it.each([
  new Api.UpdateDialogFilters(),
  new Api.UpdateDialogFilter({ id: 9 }),
  new Api.UpdateDialogFilterOrder({ order: [9, 3] }),
  new Api.UpdateFolderPeers({
    folderPeers: [
      new Api.FolderPeer({
        peer: new Api.PeerUser({ userId: 42 as never }),
        folderId: 1,
      }),
    ],
    pts: 1,
    ptsCount: 0,
  }),
  new Api.UpdateNotifySettings({
    peer: new Api.NotifyUsers(),
    notifySettings: new Api.PeerNotifySettings({}),
  }),
])(
  'turns Telegram folder and rule changes into account metadata refresh signals',
  (update) => {
    expect(normalizeTelegramCrmRaw(update)).toEqual([
      update instanceof Api.UpdateFolderPeers
        ? {
            type: 'folders.changed',
            telegramUserIds: ['42'],
            sequence: { pts: 1, ptsCount: 0 },
          }
        : { type: 'folders.changed' },
    ]);
  },
);

it('ignores channel-only notification and archive changes', () => {
  const channel = new Api.PeerChannel({ channelId: 42 as never });
  expect(
    normalizeTelegramCrmRaw(
      new Api.UpdateNotifySettings({
        peer: new Api.NotifyPeer({ peer: channel }),
        notifySettings: new Api.PeerNotifySettings({}),
      }),
    ),
  ).toEqual([]);
  expect(
    normalizeTelegramCrmRaw(
      new Api.UpdateFolderPeers({
        folderPeers: [new Api.FolderPeer({ peer: channel, folderId: 1 })],
        pts: 1,
        ptsCount: 0,
      }),
    ),
  ).toEqual([
    {
      type: 'folders.changed',
      telegramUserIds: [],
      sequence: { pts: 1, ptsCount: 0 },
    },
  ]);
});
