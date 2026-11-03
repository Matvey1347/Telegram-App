import {
  extractLeadTargetEvidence,
  resolveLeadTargets,
} from './lead-advertised-targets';

describe('advertised target evidence', () => {
  it('keeps external project references unverified when no target source exists', () => {
    const metadata = {
      complete: true,
      incompleteReasons: [],
      entityUrls: ['https://instagram.com/independent.project'],
      textUrls: ['https://instagram.com/independent.project'],
      inlineButtonUrls: ['https://t.me/independent_project'],
      mentions: [],
      hasForwardMetadata: false,
      forwardChannelId: null,
      hasMedia: false,
      mediaType: null,
    };
    const evidence = resolveLeadTargets(
      extractLeadTargetEvidence(
        'Website https://independent.example/about',
        metadata,
      ),
      { channelId: '11', username: 'source_channel' },
      [],
    );
    expect(evidence).toEqual(
      expect.arrayContaining([
        {
          kind: 'TELEGRAM_USERNAME',
          value: 'independent_project',
          origin: 'INLINE_BUTTON',
          confidence: 'UNVERIFIED',
        },
        {
          kind: 'PUBLIC_URL',
          value: 'https://instagram.com/independent.project',
          origin: 'TEXT_URL',
          confidence: 'UNVERIFIED',
        },
        {
          kind: 'PUBLIC_URL',
          value: 'https://independent.example/about',
          origin: 'TEXT',
          confidence: 'UNVERIFIED',
        },
      ]),
    );
    expect(evidence.some((item) => item.confidence === 'CANONICAL')).toBe(
      false,
    );
  });
  it('preserves origins and excludes own footer without promoting unknown usernames', () => {
    const metadata = {
      complete: true,
      incompleteReasons: [],
      entityUrls: ['https://t.me/other_channel?secret=x'],
      inlineButtonUrls: ['https://example.org/path?token=x'],
      mentions: ['@own_channel'],
      hasForwardMetadata: false,
      forwardChannelId: null,
      hasMedia: false,
      mediaType: null,
    } as const;
    const evidence = extractLeadTargetEvidence(
      'Visit https://shop.example/item and @own_channel',
      {
        ...metadata,
        entityUrls: [...metadata.entityUrls],
        inlineButtonUrls: [...metadata.inlineButtonUrls],
        mentions: [...metadata.mentions],
        incompleteReasons: [],
      },
    );
    const result = resolveLeadTargets(
      evidence,
      { channelId: '11', username: 'own_channel' },
      [{ channelId: '22', username: 'other_channel' }],
    );
    expect(result).toContainEqual({
      kind: 'TELEGRAM_CHANNEL_ID',
      value: '22',
      origin: 'ENTITY',
      confidence: 'CANONICAL',
    });
    expect(result).toContainEqual({
      kind: 'PUBLIC_URL',
      value: 'https://example.org/path',
      origin: 'INLINE_BUTTON',
      confidence: 'UNVERIFIED',
    });
    expect(result.some((row) => row.value === 'own_channel')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('distinguishes hidden TextUrl, buttons and forward identity while dropping own forward', () => {
    const metadata = {
      complete: true,
      incompleteReasons: [],
      entityUrls: ['https://t.me/advertised'],
      textUrls: ['https://t.me/advertised'],
      inlineButtonUrls: ['https://t.me/second_channel'],
      mentions: [],
      hasForwardMetadata: true,
      forwardChannelId: '11',
      hasMedia: false,
      mediaType: null,
    };
    const result = resolveLeadTargets(
      extractLeadTargetEvidence('Article without visible links', metadata),
      { channelId: '11', username: 'own_channel' },
      [],
    );
    expect(result).toContainEqual({
      kind: 'TELEGRAM_USERNAME',
      value: 'advertised',
      origin: 'TEXT_URL',
      confidence: 'UNVERIFIED',
    });
    expect(result).toContainEqual({
      kind: 'TELEGRAM_USERNAME',
      value: 'second_channel',
      origin: 'INLINE_BUTTON',
      confidence: 'UNVERIFIED',
    });
    expect(result.some((item) => item.kind === 'TELEGRAM_CHANNEL_ID')).toBe(
      false,
    );
  });
  it('does not infer a canonical identity from a project title or an unrelated link', () => {
    const evidence = extractLeadTargetEvidence(
      'Project Alpha: read an article at https://example.org/story',
    );
    expect(evidence).toEqual([
      {
        kind: 'PUBLIC_URL',
        value: 'https://example.org/story',
        origin: 'TEXT',
        confidence: 'UNVERIFIED',
      },
    ]);
  });
  it('does not expose private invite hashes or infer channel IDs from unverified usernames', () => {
    const evidence = extractLeadTargetEvidence(
      'https://t.me/+AbCdEf123 @unverified_channel',
    );
    const result = resolveLeadTargets(
      evidence,
      { channelId: '1', username: null },
      [],
    );
    expect(
      result.find((row) => row.kind === 'PRIVATE_INVITE')?.value,
    ).not.toContain('AbCdEf123');
    expect(result.some((row) => row.kind === 'TELEGRAM_CHANNEL_ID')).toBe(
      false,
    );
  });
});
