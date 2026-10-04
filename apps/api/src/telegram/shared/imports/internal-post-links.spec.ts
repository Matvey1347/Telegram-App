import {
  extractInternalPostLinkIds,
  extractSynchronizedTelegramPostLinkIds,
  replaceInternalPostLinks,
  replaceSynchronizedTelegramPostLinks,
} from './internal-post-links';

describe('internal post links', () => {
  it('extracts unique managed post ids', () => {
    expect(
      extractInternalPostLinkIds(
        '[First](tg-post:post_1) [Second](tg-post:post-2) [Again](tg-post:post_1)',
      ),
    ).toEqual(['post_1', 'post-2']);
  });

  it('replaces internal links while preserving labels and external links', () => {
    expect(
      replaceInternalPostLinks(
        '[First](tg-post:post_1) [Site](https://example.com)',
        new Map([['post_1', 'https://t.me/example/10']]),
      ),
    ).toBe('[First](https://t.me/example/10) [Site](https://example.com)');
  });

  it('leaves unresolved internal links unchanged', () => {
    expect(
      replaceInternalPostLinks(
        '[First](tg-post:post_1)',
        new Map<string, string>(),
      ),
    ).toBe('[First](tg-post:post_1)');
  });

  it('extracts and replaces a legacy double-prefixed synchronized post link', () => {
    const text = '[тест 1](tg-post:telegram-post:source-post-id)';
    expect(extractSynchronizedTelegramPostLinkIds(text)).toEqual([
      'source-post-id',
    ]);
    expect(
      replaceSynchronizedTelegramPostLinks(
        text,
        new Map([['source-post-id', 'https://t.me/c/3988203250/2']]),
      ),
    ).toBe('[тест 1](https://t.me/c/3988203250/2)');
  });
});
