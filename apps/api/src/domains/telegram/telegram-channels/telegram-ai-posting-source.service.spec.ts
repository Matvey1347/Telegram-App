import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';

describe('TelegramAiPostingSourceService', () => {
  const make = () => {
    const prisma: any = {
      telegramChannel: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          title: 'Target channel',
          language: 'en',
        }),
        findMany: jest.fn(),
      },
      telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
      telegramPost: { findMany: jest.fn() },
    };
    return {
      service: new TelegramAiPostingSourceService(prisma),
      prisma,
    };
  };

  it('searches the open image index and accepts only public-domain HTTPS results', async () => {
    const { service } = make();
    const fetch = jest.spyOn(service as any, 'fetchPublic').mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          results: [
            { url: 'https://images.example/one.jpg', license: 'cc0' },
            { url: 'https://images.example/two.jpg', license: 'by' },
            { url: 'http://images.example/three.jpg', license: 'pdm' },
          ],
        }),
      ),
    );
    expect(await service.searchOpenImages('abstract psychology')).toEqual([
      {
        url: 'https://images.example/one.jpg',
        sourceId: 'openverse',
        sourceType: 'image-search',
      },
    ]);
    expect(fetch.mock.calls[0][0]).toContain('license=cc0%2Cpdm');
  });

  it('checks that a feed is reachable and has entries', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockResolvedValue(
        Buffer.from(
          '<feed><entry><title>Story</title><summary>Content</summary></entry></feed>',
        ),
      );
    await expect(
      service.checkWebSource('rss', 'https://example.org/feed'),
    ).resolves.toEqual({
      ok: true,
      available: true,
      message: 'Лента доступна, записи найдены.',
    });
  });

  it('distinguishes a reachable empty feed from an unavailable one', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockResolvedValueOnce(Buffer.from('<feed></feed>'))
      .mockRejectedValueOnce(new Error('network error'));

    await expect(
      service.checkWebSource('rss', 'https://example.org/empty'),
    ).resolves.toMatchObject({ available: true, ok: false });
    await expect(
      service.checkWebSource('rss', 'https://example.org/down'),
    ).resolves.toMatchObject({ available: false, ok: false });
  });

  it.each([
    [
      'website enabled without rights flag',
      {
        id: 'website',
        type: 'website',
        value: 'https://on.example/article',
        enabled: true,
        useImages: true,
        rightsConfirmed: false,
      },
      true,
    ],
    [
      'RSS enabled without rights flag',
      {
        id: 'rss',
        type: 'rss',
        value: 'https://rss.example/feed',
        enabled: true,
        useImages: true,
      },
      true,
    ],
    [
      'image switch disabled',
      {
        id: 'off',
        type: 'website',
        value: 'https://off.example/article',
        enabled: true,
        useImages: false,
        rightsConfirmed: true,
      },
      false,
    ],
    [
      'legacy source without image field',
      {
        id: 'legacy',
        type: 'website',
        value: 'https://legacy.example/article',
        enabled: true,
        rightsConfirmed: false,
      },
      true,
    ],
    [
      'source disabled',
      {
        id: 'disabled',
        type: 'website',
        value: 'https://disabled.example/article',
        enabled: false,
        useImages: true,
      },
      false,
    ],
  ])('uses image switch for %s', async (_label, source, expected) => {
    const { service } = make();
    const fetchPublic = jest
      .spyOn(service as any, 'fetchPublic')
      .mockImplementation((value: string) => {
        const host = new URL(value).hostname;
        return Promise.resolve(
          Buffer.from(
            `<rss><channel><item><title>Article</title><description>Content</description><enclosure url="https://${host}/image.jpg" /></item></channel></rss><img src="https://${host}/image.jpg">`,
          ),
        );
      });
    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: { historyMode: 'none', sources: [source] },
    });
    expect(
      result.imageCandidates.some((item) => item.sourceId === source.id),
    ).toBe(expected);
    if (source.enabled === false) expect(fetchPublic).not.toHaveBeenCalled();
  });

  it('rotates the bounded image candidates across enabled sources on different runs', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockImplementation((value: string) =>
        Promise.resolve(
          Buffer.from(
            `<article>Content</article><img src="${value}/image.jpg">`,
          ),
        ),
      );
    const sources = Array.from({ length: 4 }, (_, index) => ({
      id: `source-${index}`,
      type: 'website',
      value: `https://source-${index}.example`,
      enabled: true,
      useImages: true,
    }));
    const first = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: { historyMode: 'none', sources },
      imageSelectionKey: 'run-a',
    });
    const second = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: { historyMode: 'none', sources },
      imageSelectionKey: 'run-c',
    });
    expect(first.imageCandidates).toHaveLength(2);
    expect(second.imageCandidates).toHaveLength(2);
    expect(
      new Set(
        [...first.imageCandidates, ...second.imageCandidates].map(
          (item) => item.sourceId,
        ),
      ),
    ).toEqual(new Set(sources.map((item) => item.id)));
  });

  it('changes which of two enabled sources is tried first across runs', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockImplementation((value: string) =>
        Promise.resolve(
          Buffer.from(
            `<article>Content</article><img src="${value}/image.jpg">`,
          ),
        ),
      );
    const sources = Array.from({ length: 2 }, (_, index) => ({
      id: `source-${index}`,
      type: 'website',
      value: `https://source-${index}.example`,
      enabled: true,
      useImages: true,
    }));
    const first = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: { historyMode: 'none', sources },
      imageSelectionKey: 'run-a',
    });
    const second = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: { historyMode: 'none', sources },
      imageSelectionKey: 'run-f',
    });
    expect(first.imageCandidates[0].sourceId).not.toBe(
      second.imageCandidates[0].sourceId,
    );
  });

  it('retains a fallback image when only one source is enabled', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockResolvedValue(
        Buffer.from(
          '<article>Content</article><img src="https://single.example/first.jpg"><img src="https://single.example/second.jpg">',
        ),
      );
    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'single',
            type: 'website',
            value: 'https://single.example',
            enabled: true,
            useImages: true,
          },
        ],
      },
      imageSelectionKey: 'run-a',
    });
    expect(result.imageCandidates.map((item) => item.url)).toEqual([
      'https://single.example/first.jpg',
      'https://single.example/second.jpg',
    ]);
  });

  it('includes eligible Telegram and website sources while excluding Telegram sources that lost eligibility', async () => {
    const { service, prisma } = make();
    const eligiblePosts = [
      {
        text: 'Authorized source content',
        formattedText: null,
        imageUrls: ['https://images.example/allowed.jpg'],
        postDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const unauthorizedPosts = [
      {
        text: 'Unavailable source secret content',
        formattedText: null,
        imageUrls: ['https://images.example/unauthorized.jpg'],
        postDate: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'eligible-channel' },
    ]);
    prisma.telegramPost.findMany.mockImplementation(async ({ where }: any) =>
      where.telegramChannelId === 'eligible-channel'
        ? eligiblePosts
        : unauthorizedPosts,
    );
    const fetchPublic = jest
      .spyOn(service as any, 'fetchPublic')
      .mockImplementation(async (value: string) => {
        if (value.includes('rss.example'))
          throw new Error('secret network detail');
        if (value.includes('empty.example'))
          return Buffer.from('<article> </article>');
        return Buffer.from(
          '<article>Website source content</article><img src="https://images.example/site.jpg">',
        );
      });

    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'valid-telegram',
            type: 'telegram',
            value: 'eligible-channel',
            enabled: true,
          },
          {
            id: 'stale-telegram',
            type: 'telegram',
            value: 'stale-channel',
            enabled: true,
          },
          {
            id: 'website',
            type: 'website',
            value: 'https://source.example/article',
            rightsConfirmed: true,
            enabled: true,
          },
          {
            id: 'rss-failed',
            type: 'rss',
            value: 'https://rss.example/feed?token=secret',
            enabled: true,
          },
          {
            id: 'empty-site',
            type: 'website',
            value: 'https://empty.example/',
            enabled: true,
          },
          {
            id: 'over-limit',
            type: 'website',
            value: 'https://skipped.example/',
            enabled: true,
          },
        ],
      },
    });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        isActive: true,
        id: {
          not: 'target-channel',
          in: ['eligible-channel', 'stale-channel'],
        },
        adminLinks: { some: {} },
      },
      select: { id: true, title: true, username: true },
    });
    expect(prisma.telegramPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          telegramChannelId: 'eligible-channel',
          telegramChannel: {
            is: {
              workspaceId: 'workspace-a',
              isActive: true,
              id: { not: 'target-channel', in: ['eligible-channel'] },
              adminLinks: { some: {} },
            },
          },
        },
      }),
    );
    expect(result.sourceContexts.join('\n')).toContain(
      'Authorized source content',
    );
    expect(result.sourceContexts.join('\n')).toContain(
      'Website source content',
    );
    expect(result.sourceContexts.join('\n')).not.toContain(
      'Unavailable source secret content',
    );
    expect(result.sourceContexts.join('\n')).not.toContain('stale-channel');
    expect(result.imageCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://images.example/allowed.jpg',
          sourceId: 'valid-telegram',
        }),
        expect.objectContaining({
          url: 'https://images.example/site.jpg',
          sourceId: 'website',
        }),
      ]),
    );
    expect(result.imageCandidates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://images.example/unauthorized.jpg',
          sourceId: 'stale-telegram',
        }),
      ]),
    );
    expect(fetchPublic).toHaveBeenCalledWith(
      'https://source.example/article',
      2 * 1024 * 1024,
    );
    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({
        sourceId: 'valid-telegram',
        status: 'COLLECTED',
      }),
      expect.objectContaining({
        sourceId: 'stale-telegram',
        status: 'INELIGIBLE',
      }),
      expect.objectContaining({
        sourceId: 'website',
        status: 'COLLECTED',
        displayValue: 'source.example',
      }),
      expect.objectContaining({
        sourceId: 'rss-failed',
        status: 'UNAVAILABLE',
        displayValue: 'rss.example',
        reason: 'SOURCE_FETCH_FAILED',
      }),
      expect.objectContaining({ sourceId: 'empty-site', status: 'EMPTY' }),
      expect.objectContaining({
        sourceId: 'over-limit',
        status: 'COLLECTED',
      }),
    ]);
    expect(JSON.stringify(result.sourceDiagnostics)).not.toContain('secret');
    expect(result.sourceRefs).toEqual([
      expect.objectContaining({ id: 'valid-telegram' }),
      expect.objectContaining({ id: 'website', value: 'source.example' }),
      expect.objectContaining({ id: 'over-limit', value: 'skipped.example' }),
    ]);
  });

  it('does not query or expose malformed Telegram source identifiers', async () => {
    const { service, prisma } = make();
    prisma.telegramChannel.findMany.mockResolvedValue([]);

    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'malformed',
            type: 'telegram',
            value: 'invalid source id',
            enabled: true,
          },
        ],
      },
    });

    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
    expect(result.sourceContexts).toEqual([]);
    expect(result.imageCandidates).toEqual([]);
    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({
        status: 'INELIGIBLE',
        reason: 'SOURCE_ID_INVALID',
      }),
    ]);
  });

  it('collects RSS entries as separate feed content instead of stripping the XML page', async () => {
    const { service, prisma } = make();
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    const fetchPublic = jest
      .spyOn(service as any, 'fetchPublic')
      .mockResolvedValue(
        Buffer.from(
          '<rss><channel><item><title>First story</title><description><![CDATA[<p>Details &amp; context</p>]]></description></item><item><title>Second story</title><description>Another update</description></item></channel></rss>',
        ),
      );

    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'feed',
            type: 'rss',
            value: 'https://feed.example/rss',
            enabled: true,
          },
        ],
      },
    });

    expect(result.sourceContexts.join('\n')).toContain('title: First story');
    expect(result.sourceContexts.join('\n')).toContain('Details & context');
    expect(result.sourceContexts.join('\n')).toContain('title: Second story');
    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({ sourceId: 'feed', status: 'COLLECTED' }),
    ]);
    expect(fetchPublic).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable website without exposing the fetch error or failing collection', async () => {
    const { service } = make();
    jest
      .spyOn(service as any, 'fetchPublic')
      .mockRejectedValue(new Error('credential=private-response-detail'));

    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'website',
            type: 'website',
            value: 'https://private.example/path?token=secret',
            enabled: true,
          },
        ],
      },
    });

    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({
        sourceId: 'website',
        sourceType: 'website',
        displayValue: 'private.example',
        status: 'UNAVAILABLE',
        reason: 'SOURCE_FETCH_FAILED',
      }),
    ]);
    expect(JSON.stringify(result.sourceDiagnostics)).not.toContain(
      'private-response-detail',
    );
    expect(JSON.stringify(result.sourceDiagnostics)).not.toContain('secret');
    expect(result.sourceContexts).toEqual([]);
  });

  it('reports an eligibility lookup failure without failing collection', async () => {
    const { service, prisma } = make();
    prisma.telegramChannel.findMany.mockRejectedValue(
      new Error('internal detail'),
    );

    const result = await service.collect({
      workspaceId: 'workspace-a',
      channelId: 'target-channel',
      config: {
        historyMode: 'none',
        sources: [
          {
            id: 'telegram',
            type: 'telegram',
            value: 'source-channel',
            enabled: true,
          },
        ],
      },
    });

    expect(result.sourceDiagnostics).toEqual([
      expect.objectContaining({
        status: 'UNAVAILABLE',
        reason: 'SOURCE_CHECK_FAILED',
      }),
    ]);
    expect(result.sourceContexts).toEqual([]);
    expect(result.imageCandidates).toEqual([]);
  });
});
