import { gzipSync } from 'node:zlib';
import { Api } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { CrmReactionAssets } from './telegram-crm-reaction-assets';

const doc = (id: string, mimeType = 'application/x-tgsticker') =>
  new Api.Document({
    id: returnBigInt(id),
    accessHash: returnBigInt('1'),
    fileReference: Buffer.alloc(0),
    date: 0,
    mimeType,
    size: returnBigInt('10'),
    dcId: 1,
    attributes: [
      new Api.DocumentAttributeCustomEmoji({
        alt: '🤝',
        stickerset: new Api.InputStickerSetEmpty(),
      }),
    ],
  });
describe('CrmReactionAssets', () => {
  it('batches documents and caches exact TGS, static and video bytes', async () => {
    const client = {
      invoke: jest
        .fn()
        .mockResolvedValue([
          doc('1'),
          doc('2', 'image/webp'),
          doc('3', 'video/webm'),
        ]),
      downloadMedia: jest
        .fn()
        .mockResolvedValueOnce(gzipSync(Buffer.from('{"v":"5"}')))
        .mockResolvedValueOnce(Buffer.from('webp'))
        .mockResolvedValueOnce(Buffer.from('webm')),
    };
    const assets = new CrmReactionAssets(client as never);
    const result = await assets.get(['1', '2', '3', '1']);
    expect(result['1']).toMatchObject({
      value: '🤝',
      telegramCustomEmojiKind: 'ANIMATED',
      telegramCustomEmojiRenderAssetUrl: expect.stringMatching(
        /^data:application\/json;base64,/,
      ),
    });
    expect(result['2']).toMatchObject({
      telegramCustomEmojiKind: 'STATIC',
      telegramCustomEmojiAssetUrl: expect.stringMatching(
        /^data:image\/webp;base64,/,
      ),
    });
    expect(result['3']).toMatchObject({
      telegramCustomEmojiKind: 'VIDEO',
      telegramCustomEmojiAssetUrl: expect.stringMatching(
        /^data:video\/webm;base64,/,
      ),
    });
    await assets.get(['1', '2', '3']);
    expect(client.invoke).toHaveBeenCalledTimes(1);
    expect(client.downloadMedia).toHaveBeenCalledTimes(3);
  });
  it('skips invalid assets and respects cancellation', async () => {
    const client = {
      invoke: jest.fn().mockResolvedValue([doc('1'), doc('2', 'image/webp')]),
      downloadMedia: jest
        .fn()
        .mockResolvedValueOnce(Buffer.from('invalid gzip'))
        .mockResolvedValueOnce(Buffer.from('ok')),
    };
    const assets = new CrmReactionAssets(client as never);
    expect(Object.keys(await assets.get(['1', '2']))).toEqual(['2']);
    const abort = new AbortController();
    abort.abort();
    await expect(assets.get(['3'], abort.signal)).rejects.toThrow(
      'REQUEST_ABORTED',
    );
    expect(client.invoke).toHaveBeenCalledTimes(1);
  });
});
