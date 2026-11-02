import { Api, TelegramClient } from 'telegram';
import { readLeadPilotMedia } from './telegram-lead-pilot-media';

const peer = new Api.InputPeerChannel({
  channelId: 42 as never,
  accessHash: 99 as never,
});
function message(
  overrides: Partial<ConstructorParameters<typeof Api.Message>[0]> = {},
) {
  return new Api.Message({
    id: 10,
    peerId: new Api.PeerChannel({ channelId: 42 as never }),
    date: 1,
    message: 'caption',
    media: new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: 3 as never,
        accessHash: 2 as never,
        fileReference: Buffer.alloc(0),
        date: 1,
        sizes: [new Api.PhotoSize({ type: 'm', w: 2, h: 2, size: 4 })],
        dcId: 1,
      }),
    }),
    ...overrides,
  });
}
function setup(row: Api.Message, bytes = Buffer.from([0xff, 0xd8, 0xff, 0])) {
  const close = jest.fn().mockResolvedValue(undefined);
  const client = {
    getMessages: jest.fn().mockResolvedValue([row]),
    iterDownload: jest.fn().mockReturnValue({
      close,
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield bytes;
      },
    }),
  };
  return { client, close };
}
describe('bounded channel media reader', () => {
  it('reads only the requested message on the existing client and closes the iterator', async () => {
    const h = setup(message());
    const result = await readLeadPilotMedia(
      h.client as unknown as TelegramClient,
      peer,
      10,
      5,
    );
    expect(result.mime).toBe('image/jpeg');
    expect(result.data.length).toBe(4);
    expect(h.client.getMessages).toHaveBeenCalledWith(peer, { ids: [10] });
    expect(h.close).toHaveBeenCalledTimes(1);
  });
  it('rejects a protected or wrong-channel message before download', async () => {
    for (const row of [
      message({ noforwards: true }),
      message({ peerId: new Api.PeerChannel({ channelId: 43 as never }) }),
    ]) {
      const h = setup(row);
      await expect(
        readLeadPilotMedia(h.client as unknown as TelegramClient, peer, 10, 5),
      ).rejects.toThrow();
      expect(h.client.iterDownload).not.toHaveBeenCalled();
    }
  });
  it('closes the iterator when the received bytes exceed the limit', async () => {
    const h = setup(message(), Buffer.alloc(6));
    await expect(
      readLeadPilotMedia(h.client as unknown as TelegramClient, peer, 10, 5),
    ).rejects.toThrow('LEAD_MEDIA_TOO_LARGE');
    expect(h.close).toHaveBeenCalledTimes(1);
  });
  it('leaves image documents for manual review without downloading them', async () => {
    const row = message({
      media: new Api.MessageMediaDocument({
        document: new Api.Document({
          id: 3 as never,
          accessHash: 2 as never,
          fileReference: Buffer.alloc(0),
          date: 1,
          mimeType: 'image/jpeg',
          size: 4 as never,
          dcId: 1,
          attributes: [],
        }),
      }),
    });
    const h = setup(row);
    await expect(
      readLeadPilotMedia(h.client as unknown as TelegramClient, peer, 10, 5),
    ).rejects.toThrow('LEAD_MEDIA_UNAVAILABLE');
    expect(h.client.iterDownload).not.toHaveBeenCalled();
  });
});
