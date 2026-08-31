import { BadRequestException } from '@nestjs/common';
import { Api } from 'telegram';
import {
  decodeTelegramCrmDialogCursor,
  encodeTelegramCrmDialogCursor,
  normalizeTelegramCrmRaw,
  parseTelegramCrmPeer,
} from './telegram-crm-mtproto.normalizer';

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
