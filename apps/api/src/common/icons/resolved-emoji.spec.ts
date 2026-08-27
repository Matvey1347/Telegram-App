import { iconToResolvedEmoji } from './resolved-emoji';

describe('iconToResolvedEmoji', () => {
  it('resolves emoji icons to unicode presentation', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-1',
        type: 'emoji',
        name: 'rocket',
        emoji: '🚀',
        imageUrl: null,
      }),
    ).toEqual({ type: 'unicode', value: '🚀', name: 'rocket' });
  });

  it('resolves image icons to image presentation', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-2',
        type: 'image',
        name: 'logo',
        emoji: null,
        imageUrl: 'https://example.com/logo.png',
      }),
    ).toEqual({
      type: 'image',
      id: 'icon-2',
      url: 'https://example.com/logo.png',
      name: 'logo',
    });
  });

  it('includes the stored Telegram Premium animation asset', () => {
    expect(
      iconToResolvedEmoji(
        {
          id: 'icon-premium',
          type: 'emoji',
          name: 'premium bubble',
          emoji: '![💬](tg://emoji?id=5368324170671202286)',
          imageUrl: null,
        },
        {
          kind: 'ANIMATED',
          assetUrl: 'https://cdn.example.com/emoji.tgs',
          renderAssetUrl: 'https://cdn.example.com/emoji.json',
        },
      ),
    ).toEqual({
      type: 'unicode',
      value: '💬',
      name: 'premium bubble',
      telegramCustomEmojiId: '5368324170671202286',
      telegramCustomEmojiKind: 'ANIMATED',
      telegramCustomEmojiAssetUrl: 'https://cdn.example.com/emoji.tgs',
      telegramCustomEmojiRenderAssetUrl: 'https://cdn.example.com/emoji.json',
    });
  });

  it('returns null for incomplete icons', () => {
    expect(
      iconToResolvedEmoji({
        id: 'icon-3',
        type: 'image',
        name: 'broken',
        imageUrl: null,
      }),
    ).toBeNull();
  });
});
