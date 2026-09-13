import { telegramBotMediaDelivery } from './telegram-managed-post-media-delivery';

describe('telegramBotMediaDelivery', () => {
  it.each([
    ['VIDEO', 'sendVideo', 'video'],
    ['ANIMATION', 'sendAnimation', 'animation'],
    ['PHOTO', 'sendPhoto', 'photo'],
  ] as const)('maps a single %s to %s', (kind, method, field) => {
    expect(
      telegramBotMediaDelivery(
        [{ kind, url: `https://cdn.test/${kind.toLowerCase()}` }],
        { text: 'Caption', entities: [] },
      ),
    ).toMatchObject({
      method,
      body: { [field]: `https://cdn.test/${kind.toLowerCase()}` },
      expectedMessageCount: 1,
    });
  });

  it('preserves mixed photo/video album order and puts the caption on the first item', () => {
    expect(
      telegramBotMediaDelivery(
        [
          { kind: 'VIDEO', url: 'https://cdn.test/first.mp4' },
          { kind: 'PHOTO', url: 'https://cdn.test/second.jpg' },
        ],
        { text: 'Caption', entities: [{ type: 'bold' }] },
      ),
    ).toEqual({
      method: 'sendMediaGroup',
      body: {
        media: [
          {
            type: 'video',
            media: 'https://cdn.test/first.mp4',
            caption: 'Caption',
            caption_entities: [{ type: 'bold' }],
          },
          { type: 'photo', media: 'https://cdn.test/second.jpg' },
        ],
      },
      expectedMessageCount: 2,
    });
  });
});
