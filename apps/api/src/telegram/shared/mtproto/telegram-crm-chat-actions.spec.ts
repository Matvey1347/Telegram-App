import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Api, TelegramClient } from 'telegram';
import { TelegramCrmChatActionTransport } from './telegram-crm-chat-actions';
import { normalizeCrmOutgoingText } from './telegram-crm-chat-text';
import {
  CRM_CHAT_MEDIA_LIMIT,
  crmVoiceDuration,
  validateCrmChatUpload,
} from './telegram-crm-chat-media';
import {
  normalizeTelegramCrmRaw,
  parseTelegramCrmMessage,
} from './telegram-crm-mtproto.normalizer';

const peer = { telegramUserId: '42', telegramAccessHash: '1242' };
function raw(
  overrides: Partial<ConstructorParameters<typeof Api.Message>[0]> = {},
) {
  return new Api.Message({
    id: 10,
    peerId: new Api.PeerUser({ userId: 42 as never }),
    message: 'Hello',
    date: 1788000000,
    out: true,
    ...overrides,
  });
}
function setup(message = raw()) {
  const client = {
    getMessages: jest
      .fn<Promise<Api.Message[]>, unknown[]>()
      .mockResolvedValue([message]),
    invoke: jest
      .fn<Promise<Api.TypeUpdates>, [Api.AnyRequest]>()
      .mockResolvedValue(
        new Api.Updates({ updates: [], users: [], chats: [], date: 1, seq: 1 }),
      ),
    uploadFile: jest
      .fn<
        Promise<Api.InputFile>,
        [{ workers: number; file: { size: number; name: string } }]
      >()
      .mockResolvedValue(
        new Api.InputFile({
          id: 1 as never,
          parts: 1,
          name: 'a',
          md5Checksum: '',
        }),
      ),
    iterDownload: jest.fn(),
  };
  return {
    client,
    actions: new TelegramCrmChatActionTransport(
      client as unknown as TelegramClient,
    ),
  };
}

describe('Telegram CRM real chat transport', () => {
  it('uses real edit entities and preserves Unicode offsets and native deadline failure', async () => {
    const { actions, client } = setup();
    await actions.editText({
      ...peer,
      telegramMessageId: 10,
      text: '😀 **bold** ||secret||',
    });
    expect(client.invoke.mock.calls[0][0]).toMatchObject({
      className: 'messages.EditMessage',
      id: 10,
      message: '😀 bold secret',
      entities: expect.arrayContaining([
        expect.objectContaining({
          className: 'MessageEntityBold',
          offset: 3,
          length: 4,
        }),
        expect.objectContaining({ className: 'MessageEntitySpoiler' }),
      ]) as unknown,
    });
    client.invoke.mockRejectedValueOnce(new Error('MESSAGE_EDIT_TIME_EXPIRED'));
    await expect(
      actions.editText({ ...peer, telegramMessageId: 10, text: 'new' }),
    ).rejects.toThrow('MESSAGE_EDIT_TIME_EXPIRED');
  });

  it.each([
    raw({ out: false }),
    raw({ viaBotId: 7 as never }),
    raw({ fwdFrom: new Api.MessageFwdHeader({ date: 1 }) }),
  ])('denies editing a foreign/bot/forwarded message', async (message) => {
    const { actions, client } = setup(message);
    await expect(
      actions.editText({ ...peer, telegramMessageId: 10, text: 'new' }),
    ).rejects.toThrow('MESSAGE_NOT_EDITABLE');
    expect(client.invoke).not.toHaveBeenCalled();
  });

  it('requires exact peer binding even though private message IDs are account scoped', async () => {
    const { actions, client } = setup(
      raw({ peerId: new Api.PeerUser({ userId: 43 as never }) }),
    );
    await expect(
      actions.getMessage({ ...peer, telegramMessageId: 10 }),
    ).rejects.toThrow('MESSAGE_PEER_MISMATCH');
    await expect(
      actions.deleteMessages({
        ...peer,
        telegramMessageIds: [10],
        revoke: true,
      }),
    ).rejects.toThrow('MESSAGE_PEER_MISMATCH');
    expect(client.invoke).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'passes the explicit delete revoke mode %s and waits for Telegram confirmation',
    async (revoke) => {
      const { actions, client } = setup();
      await expect(
        actions.deleteMessages({ ...peer, telegramMessageIds: [10], revoke }),
      ).resolves.toEqual({ confirmed: true });
      expect(client.invoke.mock.calls[0][0]).toMatchObject({
        className: 'messages.DeleteMessages',
        revoke,
        id: [10],
      });
    },
  );

  it('adds/removes actual reactions without inventing counts and refreshes current message', async () => {
    const { actions, client } = setup();
    await actions.setReaction({ ...peer, telegramMessageId: 10, emoji: '👍' });
    expect(client.invoke.mock.calls[0][0]).toMatchObject({
      className: 'messages.SendReaction',
      reaction: [expect.objectContaining({ emoticon: '👍' })],
    });
    await actions.setReaction({ ...peer, telegramMessageId: 10, emoji: null });
    expect(client.invoke.mock.calls[1][0]).toMatchObject({ reaction: [] });
    expect(client.getMessages).toHaveBeenCalledTimes(4);
  });

  it('denies protected forwards and forwards with the caller stable random ID', async () => {
    const protectedSetup = setup(raw({ noforwards: true }));
    const input = {
      origin: peer,
      destination: { telegramUserId: '43', telegramAccessHash: '1243' },
      telegramMessageId: 10,
      randomId: 908n,
    };
    await expect(protectedSetup.actions.forwardMessage(input)).rejects.toThrow(
      'PROTECTED_CONTENT',
    );
    const { actions, client } = setup();
    client.invoke.mockResolvedValue(
      new Api.Updates({
        updates: [
          new Api.UpdateNewMessage({
            message: raw({ peerId: new Api.PeerUser({ userId: 43 as never }) }),
            pts: 1,
            ptsCount: 1,
          }),
        ],
        chats: [],
        users: [],
        date: 1,
        seq: 1,
      }),
    );
    await actions.forwardMessage(input);
    expect(client.invoke.mock.calls[0][0]).toMatchObject({
      className: 'messages.ForwardMessages',
      id: [10],
    });
    expect(
      String(
        (client.invoke.mock.calls[0][0] as Api.messages.ForwardMessages)
          .randomId[0],
      ),
    ).toBe('908');
  });

  it('uploads bounded files with one SDK worker and a real SendMedia random ID', async () => {
    const { actions, client } = setup();
    client.invoke.mockResolvedValue(
      new Api.UpdateShortSentMessage({ id: 11, pts: 1, ptsCount: 1, date: 1 }),
    );
    client.getMessages.mockResolvedValue([
      raw({
        id: 11,
        media: new Api.MessageMediaDocument({
          document: new Api.Document({
            id: 1 as never,
            accessHash: 2 as never,
            fileReference: Buffer.alloc(0),
            date: 1,
            mimeType: 'application/pdf',
            size: 9 as never,
            dcId: 1,
            attributes: [
              new Api.DocumentAttributeFilename({ fileName: 'terms.pdf' }),
            ],
          }),
        }),
      }),
    ]);
    await actions.sendMedia({
      ...peer,
      kind: 'FILE',
      data: Buffer.from('%PDF-test'),
      fileName: 'terms.pdf',
      mimeType: 'application/pdf',
      randomId: 99n,
    });
    expect(client.uploadFile.mock.calls[0][0]).toMatchObject({
      workers: 1,
      file: expect.objectContaining({ size: 9, name: 'terms.pdf' }) as unknown,
    });
    expect(client.invoke.mock.calls[0][0]).toMatchObject({
      className: 'messages.SendMedia',
      media: expect.objectContaining({
        mimeType: 'application/pdf',
        forceFile: true,
      }) as unknown,
    });
  });

  it('rejects deleted reply originals before upload', async () => {
    const { actions, client } = setup();
    client.getMessages.mockResolvedValue([]);
    await expect(
      actions.sendMedia({
        ...peer,
        kind: 'FILE',
        data: Buffer.from('text'),
        fileName: 'a.txt',
        mimeType: 'text/plain',
        randomId: 1n,
        replyToTelegramMessageId: 10,
      }),
    ).rejects.toThrow('TELEGRAM_MESSAGE_UNAVAILABLE');
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it('does not blindly retry a failed media RPC', async () => {
    const { actions, client } = setup();
    client.invoke.mockRejectedValue(new Error('TIMEOUT'));
    await expect(
      actions.sendMedia({
        ...peer,
        kind: 'FILE',
        data: Buffer.from('text'),
        fileName: 'a.txt',
        mimeType: 'text/plain',
        randomId: 1n,
      }),
    ).rejects.toThrow('TIMEOUT');
    expect(client.invoke).toHaveBeenCalledTimes(1);
  });

  it('downloads only supported account-bound media and closes a bounded iterator on overflow', async () => {
    const message = raw({
      media: new Api.MessageMediaDocument({
        document: new Api.Document({
          id: 10 as never,
          accessHash: 1 as never,
          fileReference: Buffer.alloc(0),
          date: 1,
          mimeType: 'text/plain',
          size: 4 as never,
          dcId: 1,
          attributes: [
            new Api.DocumentAttributeFilename({ fileName: 'note.txt' }),
          ],
        }),
      }),
    });
    const { actions, client } = setup(message);
    const close = jest.fn().mockResolvedValue(undefined);
    client.iterDownload.mockReturnValue({
      close,
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield Buffer.from('text');
      },
    });
    await expect(
      actions.downloadMedia({ ...peer, telegramMessageId: 10, maxBytes: 10 }),
    ).resolves.toEqual({
      data: Buffer.from('text'),
      fileName: 'note.txt',
      mimeType: 'text/plain',
    });
    client.iterDownload.mockReturnValue({
      close,
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield Buffer.alloc(11);
      },
    });
    await expect(
      actions.downloadMedia({ ...peer, telegramMessageId: 10, maxBytes: 10 }),
    ).rejects.toThrow('CHAT_MEDIA_LIMIT_10_MIB');
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe('CRM media and formatting validation', () => {
  const fixture = readFileSync(
    join(__dirname, 'telegram-crm-voice.fixture.ogg'),
  );
  it('recognizes an actual generated Ogg Opus fixture without needing ffmpeg at runtime', () => {
    expect(crmVoiceDuration(fixture)).toBe(1);
    expect(
      validateCrmChatUpload({
        data: fixture,
        kind: 'VOICE',
        mimeType: 'audio/ogg;codecs=opus',
        fileName: 'voice.ogg',
      }).duration,
    ).toBe(1);
    expect(
      validateCrmChatUpload({
        data: fixture,
        kind: 'VOICE',
        mimeType: 'audio/ogg',
        fileName: 'voice.ogg',
      }).duration,
    ).toBe(1);
  });
  it.each([
    {
      data: Buffer.from('webm'),
      kind: 'VOICE',
      mimeType: 'audio/webm',
      fileName: 'voice.webm',
    },
    {
      data: Buffer.from('not an image'),
      kind: 'IMAGE',
      mimeType: 'image/png',
      fileName: 'a.png',
    },
    {
      data: Buffer.from('text'),
      kind: 'FILE',
      mimeType: 'text/html',
      fileName: 'a.html',
    },
    {
      data: Buffer.from('text'),
      kind: 'FILE',
      mimeType: 'text/plain',
      fileName: '../a.txt',
    },
    {
      data: Buffer.alloc(CRM_CHAT_MEDIA_LIMIT + 1),
      kind: 'FILE',
      mimeType: 'text/plain',
      fileName: 'a.txt',
    },
  ] as const)('rejects unsafe/unverified media %s', (input) => {
    expect(() => validateCrmChatUpload(input)).toThrow();
  });
  it('accepts verified recorder containers only as explicit file fallback', () => {
    const webm = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('webm'),
    ]);
    expect(
      validateCrmChatUpload({
        data: webm,
        kind: 'FILE',
        mimeType: 'audio/webm;codecs=opus',
        fileName: 'recording.webm',
      }),
    ).toEqual({ duration: undefined });
    expect(
      validateCrmChatUpload({
        data: Buffer.from('0000ftypM4A '),
        kind: 'FILE',
        mimeType: 'audio/mp4',
        fileName: 'recording.m4a',
      }),
    ).toEqual({ duration: undefined });
    expect(() =>
      validateCrmChatUpload({
        data: Buffer.from('wrong'),
        kind: 'FILE',
        mimeType: 'audio/webm',
        fileName: 'recording.webm',
      }),
    ).toThrow('AUDIO_CONTAINER_MISMATCH');
  });

  it('preserves Telegram formatting entities and UTF16 emoji offsets', () => {
    const normalized = normalizeCrmOutgoingText(
      '😀 **B** __I__ ++U++ ~~S~~ `C` ||X||\n> Quote\n[Link](https://example.com)',
    );
    expect(normalized.text).toContain('😀 B I U S C X');
    expect(normalized.entities).toEqual(
      expect.arrayContaining(
        [
          'bold',
          'italic',
          'underline',
          'strike',
          'code',
          'spoiler',
          'blockquote',
          'textUrl',
        ].map((type) => expect.objectContaining({ type }) as unknown),
      ),
    );
    expect(normalized.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold', offset: 3, length: 1 }),
      ]),
    );
  });
  it('escapes HTML as literal text and rejects oversized rendered text', () => {
    expect(normalizeCrmOutgoingText('<script>alert(1)</script>').text).toBe(
      '<script>alert(1)</script>',
    );
    expect(() => normalizeCrmOutgoingText('x'.repeat(4097))).toThrow(
      'INVALID_MESSAGE_LENGTH',
    );
  });
  it('normalizes compact media/reply/reaction/forward metadata without secret references', () => {
    const message = parseTelegramCrmMessage(
      raw({
        noforwards: true,
        replyTo: new Api.MessageReplyHeader({ replyToMsgId: 9 }),
        reactions: new Api.MessageReactions({
          results: [
            new Api.ReactionCount({
              reaction: new Api.ReactionEmoji({ emoticon: '❤️' }),
              count: 2,
              chosenOrder: 0,
            }),
          ],
        }),
        fwdFrom: new Api.MessageFwdHeader({ date: 1, fromName: 'Source' }),
      }),
    );
    expect(message?.contentMetadata).toMatchObject({
      replyToTelegramMessageId: 9,
      protectedContent: true,
      reactions: [{ emoji: '❤️', count: 2, chosen: true }],
      forwarded: { author: 'Source' },
    });
    expect(JSON.stringify(message?.contentMetadata)).not.toMatch(
      /fileReference|accessHash/,
    );
  });
  it('normalizes deletion account IDs and unversioned private reaction hints', () => {
    expect(
      normalizeTelegramCrmRaw(
        new Api.UpdateDeleteMessages({ messages: [3, 4], pts: 8, ptsCount: 2 }),
      ),
    ).toEqual([
      {
        type: 'message.deleted',
        telegramMessageIds: [3, 4],
        sequence: { pts: 8, ptsCount: 2 },
      },
    ]);
    expect(
      normalizeTelegramCrmRaw(
        new Api.UpdateMessageReactions({
          peer: new Api.PeerUser({ userId: 42 as never }),
          msgId: 9,
          reactions: new Api.MessageReactions({ results: [] }),
        }),
      ),
    ).toEqual([
      {
        type: 'message.reactions',
        telegramUserId: '42',
        telegramMessageId: 9,
        reactions: [],
      },
    ]);
  });
});
