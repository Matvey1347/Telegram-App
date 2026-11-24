import { telegramAiPostingImageSourceUrls, type TelegramAiPostingImageSearchRound } from '@telegram-system/shared';

type Query = Pick<
  TelegramAiPostingImageSearchRound['queries'][number],
  'text' | 'page' | 'catalog' | 'domain'
>;

function searchPhrases(query: string) {
  return query
    .split(/[,;\n]|\s+\|\s+/u)
    .map((part) =>
      part
        .trim()
        .replace(/^["'“”]+|["'“”]+$/gu, '')
        .slice(0, 180),
    )
    .filter((part) => part.split(/\s+/u).length >= 2);
}

export function imageSearchRounds(
  query: string,
  brief: string | undefined,
  pageOffset: number,
  usePhotoDirectory = false,
  sources?: unknown,
): Query[][] {
  const [first, ...variants] = searchPhrases(query);
  const primary = first ?? query.trim().slice(0, 180);
  const examples = [
    ...(brief ?? '').matchAll(/[«“"]([a-z][a-z -]{6,78})[»”"]/gi),
  ].map((match) => match[1].trim());
  const words = new Set(primary.toLowerCase().match(/[a-z]+/gu));
  const overlap = (value: string) =>
    value
      .toLowerCase()
      .split(/\s+/u)
      .filter((word) => words.has(word)).length;
  examples.sort((a, b) => overlap(b) - overlap(a));
  const compact = (phrase: string) => phrase.split(/\s+/u).filter(
    (word) => !/^(candid|editorial|cinematic|realistic|photo(?:graphy)?|documentary|light(?:ing)?|natural)$/iu.test(word),
  );
  const explicitAlternative = variants.find((term) => term.toLowerCase() !== primary.toLowerCase());
  const alternate = explicitAlternative ?? examples[0] ?? primary;
  const subjectAndObject = (phrase: string) => {
    const terms = compact(phrase);
    return [terms[0], terms.length > 1 ? terms.at(-1) : undefined].filter(Boolean).join(' ');
  };
  const wide = subjectAndObject(alternate);
  const object = compact(primary).at(-1) ?? primary;
  const objectTerms = [...new Set(compact([primary, alternate, variants[1]].filter(Boolean).join(' ')))]
    .filter((word) => word.length > 3 && !/^(woman|women|person|people|tired|young|holding|sitting)$/iu.test(word));
  const subject = objectTerms[0] ?? object;
  const page = pageOffset + 1;
  const preferredExample = examples.find(
    (example) => example.toLowerCase() !== primary.toLowerCase(),
  );
  const rounds: Query[][] = [
    [
      { text: primary, page, catalog: 'auto' },
      ...(preferredExample
        ? [{ text: preferredExample, page, catalog: 'auto' as const }]
        : []),
    ],
    [
      { text: alternate, page, catalog: 'wikimedia' },
      { text: subjectAndObject(primary), page, catalog: 'auto' },
    ],
    [
      { text: variants[1] ?? wide, page, catalog: 'auto' },
      { text: object, page, catalog: 'wikimedia' },
      { text: primary, page: page + 1, catalog: 'auto' },
    ],
  ];
  if (usePhotoDirectory) {
    rounds.unshift([
      { text: primary, page, catalog: 'wordpress-photos' },
      { text: alternate, page, catalog: 'wordpress-photos' },
    ]);
    rounds.push([
      { text: variants[1] ?? wide, page, catalog: 'wordpress-photos' },
      { text: object, page, catalog: 'wordpress-photos' },
      { text: compact(alternate).at(-1) ?? alternate, page: page + 1, catalog: 'wordpress-photos' },
    ]);
  }
  if (Array.isArray(sources)) {
    const configured = telegramAiPostingImageSourceUrls(sources).map((url): Pick<Query, 'catalog' | 'domain'> => {
      const domain = new URL(url).hostname.replace(/^www\./u, '');
      if (domain === 'pinterest.com') return { catalog: 'pinterest' };
      if (domain === 'commons.wikimedia.org' || domain === 'wikipedia.org' || domain.endsWith('.wikipedia.org')) return { catalog: 'wikimedia' };
      return { catalog: 'website', domain };
    });
    const phrases = [primary, ...variants, preferredExample, subjectAndObject(primary), wide]
      .filter((text): text is string => Boolean(text?.trim()))
      .filter((text, index, all) =>
        all.findIndex((item) => item.toLowerCase() === text.toLowerCase()) === index,
      );
    rounds.splice(0, rounds.length,
      ...configured.map((source) => (source.catalog === 'pinterest' ? phrases.slice(0, 3) : [primary])
        .map((text) => ({ ...source, text, page }))),
      configured.slice(0, 3).map((source) => ({ ...source, text: phrases[1] ?? primary, page })),
      configured.slice(0, 3).map((source) => ({ ...source, text: phrases[2] ?? subject, page })),
      configured.slice(0, 3).map((source) => ({ ...source, text: primary, page: page + 1 })),
    );

  }
  const seen = new Set<string>();
  return rounds
    .map((round) =>
      round.filter(({ text, page, catalog, domain }) => {
        const key = JSON.stringify([text?.toLowerCase(), page, catalog, domain]);
        if (!text || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    )
    .filter((round) => round.length > 0);
}
