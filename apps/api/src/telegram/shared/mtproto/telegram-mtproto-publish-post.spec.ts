import { Api, type TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { CustomFile } from 'telegram/client/uploads';
import {
  publishTelegramPost,
  type TelegramPublishPostParams,
} from './telegram-mtproto-publish-post';

const future = new Date(Date.now() + 86_400_000);
const peer = new Api.InputPeerChannel({
  channelId: returnBigInt(42),
  accessHash: returnBigInt(7),
});
function photo() {
  return new Api.MessageMediaPhoto({
    photo: new Api.Photo({
      id: returnBigInt(11),
      accessHash: returnBigInt(12),
      fileReference: Buffer.from('ref'),
      date: 1,
      sizes: [],
      dcId: 2,
    }),
  });
}
function rawMessage(
  id = 101,
  media: Api.TypeMessageMedia | undefined = photo(),
) {
  return new Api.Message({
    id,
    peerId: new Api.PeerChannel({ channelId: returnBigInt(42) }),
    date: Math.floor(future.getTime() / 1000),
    message: 'Caption',
    media,
  });
}
function harness(messages: Api.TypeMessage[] = [rawMessage()]) {
  const events: string[] = [];
  const invoke = jest.fn((request: unknown) => {
    if (request instanceof Api.messages.GetScheduledMessages) {
      events.push('read');
      return Promise.resolve({ messages });
    }
    if (request instanceof Api.messages.DeleteScheduledMessages) {
      events.push('delete');
      return Promise.resolve({});
    }
    return Promise.reject(new Error('unexpected RPC'));
  });
  const sendFile = jest.fn(() => {
    events.push('send');
    return Promise.resolve({ id: 202 });
  });
  const client = {
    invoke,
    sendFile,
    getInputEntity: jest.fn().mockResolvedValue(peer),
    getEntity: jest.fn().mockResolvedValue({}),
  } as unknown as TelegramClient;
  const deps = {
    create: jest.fn().mockResolvedValue(client),
    close: jest.fn().mockResolvedValue(undefined),
    resolve: jest.fn().mockResolvedValue({ entity: {}, peer }),
    parse: jest.fn((text: string) => ({ text, entities: [] })),
    downloadImage: jest
      .fn()
      .mockResolvedValue(
        new CustomFile('photo.jpg', 3, '', Buffer.from('img')),
      ),
    sendText: jest.fn(() => {
      events.push('text');
      return Promise.resolve({ id: 203 });
    }),
    serialize: jest.fn((message: Api.TypeMessage) => ({
      id: String(message.id),
      text: message instanceof Api.Message ? message.message : '',
      html: '',
      date: future.toISOString(),
      hasMedia: message instanceof Api.Message && Boolean(message.media),
      mediaKind: null,
      groupedId: null,
    })),
  };
  const params: TelegramPublishPostParams = {
    apiId: '1',
    apiHash: 'hash',
    session: 'selected-priority-session',
    channel: { telegramChatId: '42' },
    html: 'Caption',
    imageUrls: ['https://expired.example/image.jpg'],
    scheduleAt: future,
    replacement: {
      messageIds: ['101'],
      validate: jest.fn(),
      beforeChange: jest.fn(() => {
        events.push('before');
        return Promise.resolve();
      }),
      afterCancel: jest.fn(() => {
        events.push('ack');
        return Promise.resolve();
      }),
    },
  };
  return { deps, params, events, invoke, sendFile };
}

describe('prepared native schedule replacement', () => {
  it('does not publish when the resolved broadcast channel no longer grants posting rights', async () => {
    const h = harness();
    h.params.replacement = undefined;
    h.deps.resolve.mockResolvedValue({ entity: new Api.Channel({
      id: returnBigInt(42), broadcast: true, title: 'Fixture', date: 0,
      photo: new Api.ChatPhotoEmpty(),
    }), peer });
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow('posting rights');
    expect(h.sendFile).not.toHaveBeenCalled();
    expect(h.deps.sendText).not.toHaveBeenCalled();
  });

  it('reuses photo references on the selected account, cancels only exact old IDs and returns new IDs', async () => {
    const h = harness();
    await expect(publishTelegramPost(h.deps, h.params)).resolves.toEqual([
      '202',
    ]);
    expect(h.deps.create).toHaveBeenCalledWith(
      h.params,
      expect.any(AbortSignal),
    );
    expect(h.events).toEqual(['read', 'before', 'delete', 'ack', 'send']);
    expect(h.deps.downloadImage).not.toHaveBeenCalled();
    const deletion = h.invoke.mock.calls.find(
      ([request]) => request instanceof Api.messages.DeleteScheduledMessages,
    )?.[0] as Api.messages.DeleteScheduledMessages;
    expect(deletion.id).toEqual([101]);
    expect(h.sendFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        file: expect.any(Api.InputMediaPhoto) as unknown,
        scheduleDate: Math.floor(future.getTime() / 1000),
      }),
    );
    expect(h.deps.close).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('requires confirmed deletion for ordinary replacement (ack = %p)', async (ack) => {
    const h = harness();
    h.params.replacement!.requireCancellationAcknowledgement = true;
    h.deps.resolve.mockResolvedValue({ entity: new Api.Channel({
      id: returnBigInt(42), creator: true, title: 'Fixture', date: 0,
      photo: new Api.ChatPhotoEmpty(),
    }), peer });
    h.invoke.mockImplementation(async (request) => {
      if (request instanceof Api.messages.GetScheduledMessages) return { messages: [rawMessage()] };
      return ack ? new Api.UpdateShort({ date: 1, update: new Api.UpdateDeleteScheduledMessages({
        peer: new Api.PeerChannel({ channelId: returnBigInt(42) }), messages: [101],
      }) }) : {};
    });
    if (ack) {
      await expect(publishTelegramPost(h.deps, h.params)).resolves.toEqual(['202']);
      expect(h.sendFile).toHaveBeenCalledTimes(1);
    } else {
      await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow('did not acknowledge');
      expect(h.sendFile).not.toHaveBeenCalled();
      expect(h.params.replacement!.afterCancel).not.toHaveBeenCalled();
    }
  });

  it('reuses native document references for stored video media without downloads', async () => {
    const document = new Api.MessageMediaDocument({
      document: new Api.Document({
        id: returnBigInt(21),
        accessHash: returnBigInt(22),
        fileReference: Buffer.from('document-ref'),
        date: 1,
        mimeType: 'video/mp4',
        size: returnBigInt(10),
        dcId: 2,
        attributes: [],
      }),
    });
    const h = harness([rawMessage(101, document)]);
    h.params.imageUrls = [];
    h.params.mediaItems = [
      { kind: 'VIDEO', url: 'https://expired.example/video.mp4' },
    ];
    await expect(publishTelegramPost(h.deps, h.params)).resolves.toEqual([
      '202',
    ]);
    expect(h.deps.downloadImage).not.toHaveBeenCalled();
    expect(h.sendFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        file: expect.any(Api.InputMediaDocument) as unknown,
      }),
    );
  });

  it('stops before cancellation if the owner aborts after preparation', async () => {
    const h = harness();
    const cancellation = new AbortController();
    h.params.signal = cancellation.signal;
    h.params.replacement!.beforeChange = () => {
      cancellation.abort();
      return Promise.resolve();
    };
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'requires reconciliation',
    );
    expect(h.events).toEqual(['read']);
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('keeps an existing schedule when identity validation rejects before cancellation', async () => {
    const h = harness();
    h.params.replacement!.validate = () => {
      throw new Error('wrong content');
    };
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'wrong content',
    );
    expect(h.events).toEqual(['read']);
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('rejects missing scheduled IDs without invoking the mutation hook', async () => {
    const h = harness([]);
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'identity is incomplete',
    );
    expect(h.params.replacement!.beforeChange).not.toHaveBeenCalled();
    expect(h.events).toEqual(['read']);
  });

  it('prepares native media before deletion and leaves unsupported media untouched', async () => {
    const h = harness([rawMessage(101, new Api.MessageMediaUnsupported())]);
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'media is unsupported',
    );
    expect(h.events).toEqual(['read']);
    expect(h.params.replacement!.beforeChange).not.toHaveBeenCalled();
  });

  it('does not cancel media-only fragments when the expected multipart media count differs', async () => {
    const h = harness();
    h.params.imageUrls.push('https://example.invalid/second.jpg');
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'media count differs',
    );
    expect(h.events).toEqual(['read']);
  });

  it('prepares every text part before mutation so malformed followup markup cannot remove the old schedule', async () => {
    const h = harness();
    h.params.followupHtmlParts = ['malformed'];
    h.deps.parse.mockImplementation((text) => {
      if (text === 'malformed') throw new Error('bad markup');
      return { text, entities: [] };
    });
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'bad markup',
    );
    expect(h.events).toEqual([]);
  });

  it('does not delete when ownership or journal admission fails', async () => {
    const h = harness();
    h.params.replacement!.beforeChange = () =>
      Promise.reject(new Error('claim expired'));
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'claim expired',
    );
    expect(h.events).toEqual(['read']);
  });

  it('never sends or replays cancellation when acknowledgement persistence fails', async () => {
    const h = harness();
    h.params.replacement!.afterCancel = () =>
      Promise.reject(new Error('ack unavailable'));
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'ack unavailable',
    );
    expect(h.events).toEqual(['read', 'before', 'delete']);
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('never retries a send that fails after the old schedule was cancelled', async () => {
    const h = harness();
    h.sendFile.mockRejectedValue(
      new Error('connection lost after cancellation'),
    );
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'connection lost',
    );
    expect(h.events).toEqual(['read', 'before', 'delete', 'ack']);
    expect(h.sendFile).toHaveBeenCalledTimes(1);
    expect(
      h.invoke.mock.calls.filter(
        ([request]) => request instanceof Api.messages.DeleteScheduledMessages,
      ),
    ).toHaveLength(1);
  });

  it('retains normal publication without replacement, including media preparation failures', async () => {
    const h = harness();
    delete h.params.replacement;
    h.deps.downloadImage.mockRejectedValue(
      new Error('media download unavailable'),
    );
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'media download unavailable',
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('starts normal publication admission after media preparation and before its first send', async () => {
    const h = harness();
    delete h.params.replacement;
    h.deps.downloadImage.mockImplementation(() => {
      h.events.push('prepare');
      return Promise.resolve(
        new CustomFile('photo.jpg', 3, '', Buffer.from('img')),
      );
    });
    h.params.beforeSend = () => {
      h.events.push('admit');
      return Promise.resolve();
    };
    await expect(publishTelegramPost(h.deps, h.params)).resolves.toEqual([
      '202',
    ]);
    expect(h.events).toEqual(['prepare', 'admit', 'send']);
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('does not admit a normal publication when media preparation fails', async () => {
    const h = harness();
    delete h.params.replacement;
    h.params.beforeSend = jest.fn().mockResolvedValue(undefined);
    h.deps.downloadImage.mockRejectedValue(new Error('cannot prepare media'));
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'cannot prepare media',
    );
    expect(h.params.beforeSend).not.toHaveBeenCalled();
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('does not send when normal publication admission rejects after preparation', async () => {
    const h = harness();
    delete h.params.replacement;
    h.params.beforeSend = () => Promise.reject(new Error('admission rejected'));
    await expect(publishTelegramPost(h.deps, h.params)).rejects.toThrow(
      'admission rejected',
    );
    expect(h.deps.downloadImage).toHaveBeenCalledTimes(1);
    expect(h.sendFile).not.toHaveBeenCalled();
  });

  it('sends prepared text-only replacement parts after cancellation', async () => {
    const previous = rawMessage();
    previous.media = undefined;
    const h = harness([previous]);
    h.params.imageUrls = [];
    h.params.textHtmlParts = ['Caption'];
    await expect(publishTelegramPost(h.deps, h.params)).resolves.toEqual([
      '203',
    ]);
    expect(h.events).toEqual(['read', 'before', 'delete', 'ack', 'text']);
  });
});
