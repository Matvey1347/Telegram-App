import { Api } from 'telegram';
import { HTMLParser } from 'telegram/extensions/html';
import { parseTelegramSpoilers } from './telegram-spoilers';
import {
  telegramHtmlToGramJsAlbumHtml,
  telegramHtmlToManagedMarkup,
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
  telegramMarkupToRichHtml,
  requiresNativeTelegramRichMessage,
} from './telegram-markup';

describe('telegramMarkupToHtml', () => {
  it('uses native rich message HTML for pull quotes and a visible fallback elsewhere', () => {
    expect(telegramMarkupToHtml(':::quote credit="Ada"\nQuote\n:::')).toBe(
      '<blockquote>Quote\n<i>— Ada</i></blockquote>',
    );
    expect(telegramMarkupToHtml(':::pullquote credit="Ada"\nQuote\n:::')).toBe(
      '<blockquote>Quote\n<i>— Ada</i></blockquote>',
    );
    expect(
      telegramMarkupToRichHtml(':::pullquote credit="Ada"\nQuote\n:::'),
    ).toBe('<aside>Quote<cite>Ada</cite></aside>');
    expect(requiresNativeTelegramRichMessage(':::pullquote\nQuote\n:::')).toBe(
      true,
    );
    expect(
      telegramHtmlToMtprotoHtml('<aside>Quote<cite>Ada</cite></aside>'),
    ).toBe('<blockquote>Quote\n<i>— Ada</i></blockquote>');
  });
  it('keeps consecutive pull quotes as separate rich blocks, including a credit', () => {
    expect(
      telegramMarkupToRichHtml(
        ':::pullquote\nFirst\n:::\n\n:::pullquote credit="Ada"\nSecond\n:::',
      ),
    ).toBe('<aside>First</aside>\n\n<aside>Second<cite>Ada</cite></aside>');
  });
  it('renders editor headings and tables without publishing their source syntax', () => {
    expect(
      telegramMarkupToHtml(
        '## Section\n\n:::table header\n| Header 1 | Header 2 |\n| Cell 1 | Cell 2 |\n:::\n\n###### Footnote',
      ),
    ).toBe(
      '<b>Section</b>\n\n<b>Header 1 | Header 2</b>\n<pre>Cell 1 | Cell 2</pre>\n\n<b>Footnote</b>',
    );
  });
  it('renders headings and tables as native rich-message HTML', () => {
    expect(
      telegramMarkupToRichHtml(
        '# Section\n\n:::table header\n| Header 1 | Header 2 |\n| Cell 1 | Cell 2 |\n:::',
      ),
    ).toBe(
      '<h1>Section</h1>\n\n<table bordered><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></table>',
    );
  });
  it('keeps inline formatting and premium emoji inside native table cells', () => {
    expect(
      telegramMarkupToRichHtml(
        ':::table header\n| ![🧩](tg://emoji?id=5213306719215577669) **Header 1** | Header 2 |\n| Cell 1 | Cell 2 |\n:::',
      ),
    ).toBe(
      '<table bordered><tr><th><tg-emoji emoji-id="5213306719215577669">🧩</tg-emoji> <b>Header 1</b></th><th>Header 2</th></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></table>',
    );
  });
  it('publishes per-cell highlighting and alignment as native table attributes', () => {
    expect(
      telegramMarkupToRichHtml(
        ':::table header\n| {{cell align=left highlight=false}}Plain | {{cell align=center}}Header |\n| {{cell highlight=true align=right}}Total | Value |\n:::',
      ),
    ).toBe(
      '<table bordered><tr><td align="left">Plain</td><th align="center">Header</th></tr><tr><th align="right">Total</th><td>Value</td></tr></table>',
    );
  });
  it('detects only markup that requires Bot API native rich messages', () => {
    expect(requiresNativeTelegramRichMessage('# Heading')).toBe(true);
    expect(
      requiresNativeTelegramRichMessage(':::table header\n| A | B |\n:::'),
    ).toBe(true);
    expect(requiresNativeTelegramRichMessage('**ordinary bold**')).toBe(false);
  });
  it('renders the reported combined rich post without leaking source directives', () => {
    const source = [
      ':::pullquote',
      'Выносная цитата',
      ':::',
      '',
      ':::pullquote credit="тест"',
      'Выносная цитата',
      ':::',
      '',
      '# Цитата',
      '###### Цитата',
      '',
      ':::table header',
      '| Заголовок 1 | Заголовок 2 |',
      '| Ячейка 1 | Ячейка 2 |',
      ':::',
      '',
      '[тест 1](https://t.me/c/3988203250/2)',
    ].join('\n');

    const richHtml = telegramMarkupToRichHtml(source);
    expect(requiresNativeTelegramRichMessage(source)).toBe(true);
    expect(richHtml).toContain('<aside>Выносная цитата</aside>');
    expect(richHtml).toContain(
      '<aside>Выносная цитата<cite>тест</cite></aside>',
    );
    expect(richHtml).toContain('<h1>Цитата</h1>');
    expect(richHtml).toContain('<h6>Цитата</h6>');
    expect(richHtml).toContain(
      '<table bordered><tr><th>Заголовок 1</th><th>Заголовок 2</th></tr><tr><td>Ячейка 1</td><td>Ячейка 2</td></tr></table>',
    );
    expect(richHtml).toContain(
      '<a href="https://t.me/c/3988203250/2">тест 1</a>',
    );
    expect(richHtml).not.toContain(':::');
  });
  it('does not convert unresolved internal post links', () => {
    expect(telegramMarkupToHtml('[Post](tg-post:post_1)')).toBe(
      '[Post](tg-post:post_1)',
    );
  });

  it('converts supported formatting and escapes user html', () => {
    expect(
      telegramMarkupToHtml(
        '**bold** __italic__ ~~old~~ ||secret|| `x < y` <script>',
      ),
    ).toBe(
      '<b>bold</b> <i>italic</i> <s>old</s> <tg-spoiler>secret</tg-spoiler> <code>x &lt; y</code> &lt;script&gt;',
    );
  });

  it('converts fenced code blocks', () => {
    expect(telegramMarkupToHtml('```js\nconst x = 1 < 2\n```')).toBe(
      '<pre><code class="language-js">const x = 1 &lt; 2\n</code></pre>',
    );
  });

  it('converts fenced code blocks with a Cyrillic copy label', () => {
    expect(telegramMarkupToHtml('```ц2увкае\ncode block\n```')).toBe(
      '<pre><code class="language-ц2увкае">code block\n</code></pre>',
    );
  });

  it('keeps the default copy label when fenced code block has no header', () => {
    expect(telegramMarkupToHtml('```\ncode block\n```')).toBe(
      '<pre><code>code block\n</code></pre>',
    );
  });

  it('treats same-line fenced text with spaces as a code block label', () => {
    expect(
      telegramMarkupToHtml(
        '```немає чужого бренду\n→ менша брендова націнка\n```',
      ),
    ).toBe(
      '<pre><code class="language-немає чужого бренду">→ менша брендова націнка\n</code></pre>',
    );
  });

  it('converts fenced code blocks with Windows line endings', () => {
    expect(
      telegramMarkupToHtml('```сделка\r\nубрать слабый актив\r\n```'),
    ).toBe(
      '<pre><code class="language-сделка">убрать слабый актив\n</code></pre>',
    );
  });

  it('converts markdown links to safe Telegram HTML links', () => {
    expect(
      telegramMarkupToHtml(
        'Открой [мой сайт](https://example.com) и [страницу](https://example.com/a?x=1&y=2)',
      ),
    ).toBe(
      'Открой <a href="https://example.com/">мой сайт</a> и <a href="https://example.com/a?x=1&amp;y=2">страницу</a>',
    );
  });

  it('does not create links for unsafe protocols or markup inside code', () => {
    expect(
      telegramMarkupToHtml(
        '[unsafe](javascript:alert(1)) `[code](https://example.com)`',
      ),
    ).toBe(
      '[unsafe](javascript:alert(1)) <code>[code](https://example.com)</code>',
    );
  });

  it('does not create a Telegram link for an incomplete hostname', () => {
    expect(telegramMarkupToHtml('[site](https://invalid)')).toBe(
      '[site](https://invalid)',
    );
  });

  it('supports underline and nested formatting', () => {
    expect(telegramMarkupToHtml('**__++~~||formatted||~~++__**')).toBe(
      '<b><i><u><s><tg-spoiler>formatted</tg-spoiler></s></u></i></b>',
    );
  });

  it('converts regular and expandable quote blocks', () => {
    expect(
      telegramMarkupToHtml(
        '> First line\n> **Second line**\n\n>> Hidden first\n>> Hidden second',
      ),
    ).toBe(
      '<blockquote>First line\n<b>Second line</b></blockquote>\n\n<blockquote expandable>Hidden first\nHidden second</blockquote>',
    );
  });

  it('normalizes spoiler tags for GramJS MTProto HTML parsing', () => {
    expect(
      telegramHtmlToMtprotoHtml(
        '<b>visible</b> <tg-spoiler>secret</tg-spoiler>',
      ),
    ).toBe('<b>visible</b> <spoiler>secret</spoiler>');
  });

  it('lets GramJS parse spoilers as MTProto spoiler entities', () => {
    const [text, entities] = HTMLParser.parse(
      telegramHtmlToMtprotoHtml('<tg-spoiler>hidden text</tg-spoiler>'),
    );

    expect(text).toBe('hidden text');
    expect(entities).toHaveLength(1);
    expect(entities[0]).toBeInstanceOf(Api.MessageEntitySpoiler);
  });

  it('uses an equivalent joinchat URL for invite links in GramJS album captions', () => {
    expect(
      telegramHtmlToGramJsAlbumHtml(
        '<a href="https://t.me/+mbliuCdzB4k0ODdk">Бізнес-патерни</a> <a href="https://example.com/a+b">Site</a>',
      ),
    ).toBe(
      '<a href="https://t.me/joinchat/mbliuCdzB4k0ODdk">Бізнес-патерни</a> <a href="https://example.com/a+b">Site</a>',
    );
  });

  it('turns canonical custom emoji markup into a Telegram custom emoji entity', () => {
    const [text, entities] = HTMLParser.parse(
      telegramMarkupToHtml('Hello ![🔥](tg://emoji?id=5368324170671202286)'),
    );

    expect(text).toBe('Hello 🔥');
    expect(entities[0]).toBeInstanceOf(Api.MessageEntityCustomEmoji);
    expect(entities[0]).toMatchObject({
      offset: 6,
      length: 2,
      documentId: '5368324170671202286',
    });
  });
});

describe('telegramHtmlToManagedMarkup', () => {
  it('restores fenced code blocks with a language label', () => {
    expect(
      telegramHtmlToManagedMarkup(
        '<pre><code class="language-сделка">убрать слабый актив\n→ не держать минус внутри группы</code></pre>',
      ),
    ).toBe(
      '```сделка\nубрать слабый актив\n→ не держать минус внутри группы```',
    );
  });

  it('restores custom emoji entities to canonical managed markup', () => {
    expect(
      telegramHtmlToManagedMarkup(
        '<tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji>',
      ),
    ).toBe('![🔥](tg://emoji?id=5368324170671202286)');
  });
});

describe('parseTelegramSpoilers', () => {
  it.each([
    [
      'hello ||secret|| world',
      'hello secret world',
      [{ type: 'spoiler', offset: 6, length: 6 }],
    ],
    ['||secret||', 'secret', [{ type: 'spoiler', offset: 0, length: 6 }]],
    [
      'a ||one|| b ||two|| c',
      'a one b two c',
      [
        { type: 'spoiler', offset: 2, length: 3 },
        { type: 'spoiler', offset: 8, length: 3 },
      ],
    ],
    [
      'привет ||секрет|| текст',
      'привет секрет текст',
      [{ type: 'spoiler', offset: 7, length: 6 }],
    ],
    [
      'emoji 😀 ||hidden 😀 text|| end',
      'emoji 😀 hidden 😀 text end',
      [{ type: 'spoiler', offset: 9, length: 14 }],
    ],
  ] as const)('parses spoiler entities for %s', (input, text, entities) => {
    expect(parseTelegramSpoilers(input)).toEqual({ text, entities });
  });

  it('leaves an unmatched delimiter as safe plain text', () => {
    expect(parseTelegramSpoilers('broken ||secret')).toEqual({
      text: 'broken ||secret',
      entities: [],
    });
  });

  it('keeps empty delimiters literal and creates no empty entity', () => {
    expect(parseTelegramSpoilers('empty |||| test')).toEqual({
      text: 'empty |||| test',
      entities: [],
    });
  });

  it('produces an explicit GramJS spoiler entity with UTF-16 offsets', () => {
    const html = telegramMarkupToHtml('emoji 😀 ||hidden 😀 text|| end');
    const [text, entities] = HTMLParser.parse(telegramHtmlToMtprotoHtml(html));
    const spoiler = entities.find(
      (entity) => entity instanceof Api.MessageEntitySpoiler,
    );

    expect(text).toBe('emoji 😀 hidden 😀 text end');
    expect(spoiler).toMatchObject({ offset: 9, length: 14 });
  });
});
