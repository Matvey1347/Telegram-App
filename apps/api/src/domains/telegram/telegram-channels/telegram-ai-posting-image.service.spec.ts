import { createHash } from 'node:crypto';
import { createTelegramAiPostingMediaRunState } from './telegram-ai-posting-media-preferences';
import { telegramAiPostingImageIdentity } from './telegram-ai-posting-image-identity';
import sharp from 'sharp';
import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { buildTelegramAiPostingImagePrompt, TelegramAiPostingImageService } from './telegram-ai-posting-image.service';

describe('TelegramAiPostingImageService', () => {
  const sources = { downloadImage: jest.fn(), searchOpenImages: jest.fn() };
  const media = { persistImageBytes: jest.fn() };
  const gateway = { execute: jest.fn() };
  const service = new TelegramAiPostingImageService(
    gateway as never,
    sources as never,
    media as never,
  );
  let imageBytes: Buffer;
  const request = (
    imageMode: string,
    imageCandidates: Array<{
      url: string;
      sourceId: string;
      sourceType: string;
    }> = [],
  ) => ({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    channelId: 'channel-1',
    topic: 'A distinct topic',
    imageMode,
    imageCandidates,
    prompt: 'Editorial image',
    mode: 'MANUAL' as const,
    aiPosting: {
      channelId: 'channel-1',
      testRunId: 'run-1',
      postingMode: 'TEST' as const,
    },
  });
  const operation = (status = 'SUCCEEDED') => ({
    operationId: 'image-operation-1',
    category: 'TELEGRAM_POSTING_IMAGE',
    model: 'image-model',
    status,
    actualCost: '0.025',
    pricingStatus: 'PRICED',
    inputTokens: null,
    outputTokens: null,
    errorCategory: status === 'SUCCEEDED' ? null : 'PROVIDER_ERROR',
  });
  const aiResponse = (encoded: string, status = 'SUCCEEDED') => ({
    operation: operation(status),
    result: status === 'SUCCEEDED' ? { imageBase64: encoded } : null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    imageBytes = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    sources.downloadImage.mockResolvedValue(imageBytes);
    sources.searchOpenImages.mockResolvedValue([]);
    media.persistImageBytes.mockResolvedValue([
      'https://media.example/image.png',
    ]);
    gateway.execute.mockResolvedValue(
      aiResponse(imageBytes.toString('base64')),
    );
  });

  it('prioritizes the references over the post setting and channel fallback', () => {
    const input = { topic: 'An awkward conversation', prompt: 'A photo in a kitchen', channelTitle: 'Жіноча сила🍃', language: 'Ukrainian (Українська)' };
    const prompt = buildTelegramAiPostingImagePrompt(input, true);
    expect(prompt).toContain('A photo in a kitchen');
    expect(prompt).toContain('reference sheet as the primary visual direction');
    expect(prompt).toContain('movement, light, color or monochrome treatment');
    expect(prompt).toContain('Do not add dialogue bubbles');
    expect(prompt).toContain('use only Ukrainian (Українська)');
    expect(prompt).not.toContain('everyday documentary frame');
    expect(buildTelegramAiPostingImagePrompt(input, false)).toContain('everyday documentary frame');
  });

  it('makes an explicit image revision the required scene even with reference photos', () => {
    const revised = 'Two colleagues sit face to face discussing a proposal over a notebook.';
    const prompt = buildTelegramAiPostingImagePrompt({
      topic: 'A discussion at work',
      prompt: 'A woman walks down an office corridor',
      generationDescription: 'Use soft documentary light',
      revisionDirection: revised,
    }, true);
    expect(prompt).toContain(revised);
    expect(prompt).toContain('takes priority');
    expect(prompt).not.toContain('walks down an office corridor');
  });

  it('retries generated gloss once, preserves the visual form and meters both checks', async () => {
    const review = (candidateIndex: number) => ({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { reply: JSON.stringify({ candidateIndex, candidateObservation: 'Landscape', candidateForm: 'landscape' }) },
    });
    gateway.execute
      .mockResolvedValueOnce(aiResponse(imageBytes.toString('base64')))
      .mockResolvedValueOnce(review(0))
      .mockResolvedValueOnce(aiResponse(imageBytes.toString('base64')))
      .mockResolvedValueOnce(review(1));
    const result = await service.resolve({ ...request('ai'), visualDirection: 'landscape' });
    expect(result.readiness).toBe('READY');
    expect(media.persistImageBytes).toHaveBeenCalledTimes(1);
    expect(gateway.execute).toHaveBeenCalledTimes(4);
    expect(gateway.execute.mock.calls[2][0].input).toContain('no foreground people');
    expect(result.searchOperations?.map(({ mediaStep }) => mediaStep)).toEqual([
      'GENERATE', 'GENERATION_REVIEW', 'GENERATION_REVIEW',
    ]);
  });

  it('rechecks the same artwork after an unreadable review and stores it with a typeset greeting', async () => {
    gateway.execute.mockResolvedValueOnce(aiResponse(imageBytes.toString('base64')))
      .mockResolvedValueOnce({
        operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
        result: null,
      })
      .mockResolvedValueOnce({
        operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
        result: { candidateIndex: 1, candidateObservation: 'Night scene', embeddedGreeting: false, visibleGreeting: '' },
      });
    const result = await service.resolve({
      ...request('ai'),
      postcard: { profile: 'daily', wish: 'Мирного вечора!', ordinal: 1 },
    });
    expect(result.readiness).toBe('READY');
    expect(result.searchOperations).toHaveLength(2);
    expect(gateway.execute.mock.calls.map(([input]) => input.category)).toEqual([
      'TELEGRAM_POSTING_IMAGE', 'TELEGRAM_POSTING_REVIEW', 'TELEGRAM_POSTING_REVIEW',
    ]);
    const [stored] = media.persistImageBytes.mock.calls[0][0];
    expect(stored.contentType).toBe('image/jpeg');
    expect(stored.bytes).not.toEqual(imageBytes);
  });

  it('rejects a generated postcard with unusable lettering after one retry', async () => {
    const review = {
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { candidateIndex: 0, rejectionReason: 'Unexpected lettering' },
    };
    gateway.execute
      .mockResolvedValueOnce(aiResponse(imageBytes.toString('base64')))
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce(aiResponse(imageBytes.toString('base64')))
      .mockResolvedValueOnce(review);
    const result = await service.resolve({
      ...request('ai'),
      postcard: { profile: 'loved', wish: 'Добраніч!', ordinal: 1 },
    });
    expect(result).toEqual(expect.objectContaining({ readiness: 'FAILED', failureCode: 'AI_POSTING_IMAGE_QUALITY_INVALID' }));
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('does not store an image whose bytes already appeared in this run', async () => {
    const fingerprint = createHash('sha256').update(imageBytes).digest('hex');
    const result = await service.resolve({
      ...request('ai'),
      usedImages: new Set([fingerprint]),
    });
    expect(result).toMatchObject({ readiness: 'FAILED', failureCode: 'AI_POSTING_IMAGE_DUPLICATE' });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('reserves a selected search image only once across parallel publications', async () => {
    const mediaRunState = createTelegramAiPostingMediaRunState();
    sources.searchOpenImages.mockResolvedValue([
      { url: 'https://example.org/shared.png', sourceId: 'openverse', sourceType: 'image-search' },
    ]);
    const results = await Promise.all([
      service.resolve({ ...request('found'), mediaRunState }),
      service.resolve({ ...request('found'), mediaRunState }),
    ]);
    expect(results.map(({ readiness }) => readiness).sort()).toEqual(['MISSING', 'READY']);
    expect(media.persistImageBytes).toHaveBeenCalledTimes(1);
  });

  it('generates after all search rounds fail when fallback is allowed', async () => {
    const result = await service.resolve({
      ...request('found'),
      fallbackToGeneration: true,
    });
    expect(result).toMatchObject({ readiness: 'READY', image: { sourceId: 'openai-image-generation' } });
    expect(result.mediaSearch?.rounds.length).toBeGreaterThan(1);
    expect(gateway.execute).toHaveBeenCalledTimes(1);
  });

  it('searches across open image sources in hybrid mode and persists the result', async () => {
    sources.searchOpenImages.mockResolvedValue([
      {
        url: 'https://example.org/image.png',
        sourceId: 'openverse',
        sourceType: 'image-search',
      },
    ]);
    const result = await service.resolve(request('hybrid'));
    expect(result.image?.sourceId).toBe('openverse');
    expect(sources.searchOpenImages).toHaveBeenCalledWith(
      'A distinct topic',
      1,
    );
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('searches another catalog after the visual review rejects the first set and retains both costs', async () => {
    const fresh = await sharp({
      create: { width: 480, height: 480, channels: 3, background: '#bb5522' },
    }).png().toBuffer();
    sources.downloadImage.mockResolvedValueOnce(imageBytes).mockResolvedValueOnce(fresh);
    sources.searchOpenImages.mockImplementation((_query, _page, catalog) => [{
      url: catalog ? 'https://upload.wikimedia.org/alternate.png' : 'https://example.org/first.png',
      sourceId: catalog ? 'wikimedia-commons' : 'openverse',
      sourceType: 'image-search',
    }]);
    gateway.execute.mockResolvedValueOnce({
      operation: { ...operation(), operationId: 'search-1', actualCost: '0.001' },
      result: { reply: '{"candidateIndex":0,"rejectionReason":"Does not show the subject"}' },
    }).mockResolvedValueOnce({
      operation: { ...operation(), operationId: 'search-2', actualCost: '0.002' },
      result: { reply: '{"candidateIndex":1,"candidateObservation":"Woman writing in a notebook"}' },
    });
    const result = await service.resolve({
      ...request('found'),
      searchQuery: 'woman writing notebook, hands writing desk',
      searchDescription: 'A candid photograph at a desk',
    });

    expect(result.image?.sourceId).toBe('wikimedia-commons');
    expect(result.mediaSearch?.rounds.map((round) => round.outcome)).toEqual(['NO_MATCH', 'SELECTED']);
    expect(result.mediaSearch?.rounds[0].observation).toBe('Does not show the subject');
    expect(result.searchOperations?.map((op) => [op.attempt, op.actualCost])).toEqual([[1, '0.001'], [2, '0.002']]);
    expect(gateway.execute.mock.calls.map(([call]) => call.category)).toEqual([
      'TELEGRAM_POSTING_REVIEW', 'TELEGRAM_POSTING_REVIEW',
    ]);
  });

  it('avoids a paid reference-only review when every search page is empty', async () => {
    const result = await service.resolve({
      ...request('found'),
      searchPageOffset: 2,
      referenceImage: imageBytes,
      generationDescription: 'Use a natural editorial style',
      searchDescription: 'A licensed outdoor photograph',
    });

    expect(sources.searchOpenImages).toHaveBeenCalledWith('A distinct topic', 3);
    expect(result).toMatchObject({ readiness: 'MISSING', failureCode: 'AI_POSTING_IMAGE_SEARCH_EXHAUSTED' });
    expect(result.mediaSearch?.rounds.map((round) => round.outcome)).toEqual([
      'NO_RESULTS', 'NO_RESULTS', 'NO_RESULTS',
    ]);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('does not redownload a Wikimedia photo already used at a different size', async () => {
    const thumbnail = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/960px-Example.jpg';
    sources.searchOpenImages.mockResolvedValue([{ url: thumbnail, sourceId: 'wikimedia-commons', sourceType: 'image-search' }]);
    const result = await service.resolve({
      ...request('found'),
      usedImages: new Set(['https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg']),
    });
    expect(result.image).toBeNull();
    expect(sources.downloadImage).not.toHaveBeenCalled();
  });

  it('tries OpenAI twice for Pinterest, then accepts a Commons image before broadening the search', async () => {
    gateway.execute.mockResolvedValue({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW', actualCost: '0.01' },
      result: { images: [] },
    });
    sources.searchOpenImages.mockResolvedValue([
      { url: 'https://upload.wikimedia.org/image.jpg', sourceId: 'wikimedia-commons', sourceType: 'image-search' },
    ]);
    const result = await service.resolve({
      ...request('found'),
      searchQuery: 'bedside reading lamp, evening book nightstand, warm bedroom light',
      imageSearchSources: ['https://www.pinterest.com/', 'https://commons.wikimedia.org/'],
    });
    expect(result.image?.sourceId).toBe('wikimedia-commons');
    expect(gateway.execute.mock.calls.map(([input]) => input.postingImageSearch)).toEqual([
      { domain: 'pinterest.com' }, { domain: 'pinterest.com' },
    ]);
    expect(gateway.execute.mock.calls.map(([input]) => input.input)).toEqual([
      expect.stringContaining('bedside reading lamp'), expect.stringContaining('evening book nightstand'),
    ]);
    expect(result.mediaSearch?.rounds.map(({ outcome }) => outcome)).toEqual(['NO_RESULTS', 'NO_RESULTS', 'SELECTED']);
    expect(result.searchOperations?.map(({ mediaStep, actualCost }) => [mediaStep, actualCost]))
      .toEqual([['WEB_SEARCH', '0.01'], ['WEB_SEARCH', '0.01']]);
  });

  it('stops searching as soon as an acceptable Pinterest image is downloaded', async () => {
    const candidate = { url: 'https://i.pinimg.com/originals/photo.jpg', sourceId: 'pinterest', sourceType: 'image-search' };
    gateway.execute.mockResolvedValue({ operation: operation(), result: { images: [candidate] } });
    const result = await service.resolve({
      ...request('found'),
      searchQuery: 'bedside reading lamp, evening book nightstand',
      imageSearchSources: ['https://www.pinterest.com/', 'https://commons.wikimedia.org/'],
    });
    expect(result.image?.sourceId).toBe('pinterest');
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(sources.searchOpenImages).not.toHaveBeenCalled();
  });

  it('creates an image after exhausting external search on a publication', async () => {
    const result = await service.resolve({
      ...request('found'),
      fallbackToGeneration: true,
      preferencePurpose: 'SEARCH',
      searchQuery: 'woman writing notebook, hands writing desk',
      imageSearchSources: ['https://www.pinterest.com/', 'https://commons.wikimedia.org/', 'https://photos.example/'],
    });

    expect(result.image?.sourceId).toBe('openai-image-generation');
    expect(result.mediaSearch?.rounds[0]?.queries[0]).toMatchObject({ catalog: 'pinterest' });
    expect(sources.searchOpenImages).toHaveBeenCalledWith('woman writing notebook', 1, 'wikimedia');
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ postingImageSearch: { domain: 'photos.example' } }));
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ postingImageSearch: {} }));
    expect(sources.searchOpenImages.mock.calls.every(([, , catalog]) => catalog !== 'wordpress-photos')).toBe(true);
    expect(gateway.execute).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'TELEGRAM_POSTING_IMAGE' }));
    expect(result.operation).toMatchObject({ mediaStep: 'GENERATE' });
  });

  it('broadens an exhausted hybrid search without consuming a generation slot', async () => {
    const result = await service.resolve({
      ...request('hybrid'),
      fallbackToGeneration: false,
      searchQuery: 'household budget receipts, woman notebook calculator, everyday expenses tracking',
    });

    expect(result).toMatchObject({
      readiness: 'MISSING', failureCode: 'AI_POSTING_IMAGE_SEARCH_EXHAUSTED',
    });
    expect(result.mediaSearch?.rounds.map(({ outcome }) => outcome)).toEqual([
      'NO_RESULTS', 'NO_RESULTS', 'NO_RESULTS',
    ]);
    expect(sources.searchOpenImages).toHaveBeenCalledWith('household receipts', 1);
    expect(sources.searchOpenImages).toHaveBeenCalledWith('receipts', 1, 'wikimedia');
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('automatically broadens the English search and returns a real photo on the fifth round', async () => {
    sources.searchOpenImages.mockImplementation(async (query, _page, catalog) =>
      catalog === 'wordpress-photos' && query === 'shopping'
        ? [{ url: 'https://pd.w.org/shopping.jpg', sourceId: 'wordpress-photos', sourceType: 'image-search' }]
        : [],
    );
    const result = await service.resolve({
      ...request('hybrid'),
      fallbackToGeneration: false,
      searchQuery: 'woman shopping, clothing store, jackets on rack',
      usePhotoDirectory: true,
    });

    expect(result.image?.sourceId).toBe('wordpress-photos');
    expect(result.mediaSearch?.rounds.map(({ outcome }) => outcome)).toEqual([
      'NO_RESULTS', 'NO_RESULTS', 'NO_RESULTS', 'NO_RESULTS', 'SELECTED',
    ]);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('uses a valid visual decision with missing usage without paying for another review', async () => {
    sources.searchOpenImages.mockResolvedValue([
      { url: 'https://example.org/first.png', sourceId: 'openverse', sourceType: 'image-search' },
    ]);
    gateway.execute.mockResolvedValue({
      operation: { ...operation('UNKNOWN'), actualCost: null, pricingStatus: 'UNKNOWN', errorCategory: 'USAGE_MISSING' },
      result: { reply: '{"candidateIndex":1,"candidateObservation":"Documentary photo"}' },
    });

    const result = await service.resolve({ ...request('found'), searchDescription: 'A documentary photo' });

    expect(result.image?.sourceId).toBe('openverse');
    expect(result.searchOperations?.[0].actualCost).toBeNull();
    expect(gateway.execute).toHaveBeenCalledTimes(1);
  });

  it('uses a found image only after reviewing the shortlist against the references', async () => {
    const second = await sharp({
      create: { width: 480, height: 480, channels: 3, background: '#a86543' },
    }).png().toBuffer();
    const candidates = [
      { url: 'https://example.org/unrelated.png', sourceId: 'openverse', sourceType: 'image-search' },
      { url: 'https://example.org/matching.png', sourceId: 'openverse', sourceType: 'image-search' },
    ];
    sources.searchOpenImages.mockResolvedValue(candidates);
    sources.downloadImage.mockResolvedValueOnce(imageBytes).mockResolvedValueOnce(second);
    gateway.execute.mockResolvedValueOnce({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { reply: '{"candidateIndex":2,"candidateObservation":"Photo of outdoor movement","referenceDirection":"Backlit documentary movement"}' },
    });
    const referenceImage = await sharp(imageBytes).jpeg().toBuffer();

    const result = await service.resolve({
      ...request('hybrid'),
      referenceImage,
      preferencePurpose: 'BOTH',
      visualPreference: 'Natural light and movement',
      searchQuery: 'woman walking evening street film photography',
    });

    expect(result).toMatchObject({ image: { sourceId: 'openverse' }, searchOperations: [expect.objectContaining({ category: 'TELEGRAM_POSTING_REVIEW', mediaStep: 'SEARCH_REVIEW' })] });
    expect(sources.searchOpenImages).toHaveBeenCalledWith('woman walking evening street film photography', 1);
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      category: 'TELEGRAM_POSTING_REVIEW',
      image: { mime: 'image/jpeg', data: expect.any(Buffer) },
    }));
    expect(media.persistImageBytes).toHaveBeenCalledWith([{ bytes: second, contentType: 'image/png' }]);
  });

  it('generates from the references when search results do not match', async () => {
    sources.searchOpenImages.mockResolvedValue([
      { url: 'https://example.org/unrelated.png', sourceId: 'openverse', sourceType: 'image-search' },
    ]);
    gateway.execute.mockResolvedValueOnce({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { reply: '{"candidateIndex":0,"referenceDirection":"Wide framing and evening backlight"}' },
    });
    const referenceImage = await sharp(imageBytes).jpeg().toBuffer();
    const result = await service.resolve({ ...request('hybrid'), referenceImage, preferencePurpose: 'BOTH' });
    expect(result).toMatchObject({
      image: { sourceId: 'openai-image-generation' },
      searchOperations: [expect.objectContaining({ category: 'TELEGRAM_POSTING_REVIEW', mediaStep: 'SEARCH_REVIEW' })],
      operation: { category: 'TELEGRAM_POSTING_IMAGE' },
    });
    expect(gateway.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      category: 'TELEGRAM_POSTING_IMAGE',
      input: expect.stringContaining('Wide framing and evening backlight'),
      image: { mime: 'image/jpeg', data: referenceImage },
    }));
  });

  it('uses the search brief to find a stock alternative without calling generation', async () => {
    sources.searchOpenImages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { url: 'https://example.org/dancer.png', sourceId: 'openverse', sourceType: 'image-search' },
    ]);
    gateway.execute.mockResolvedValueOnce({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { reply: '{"candidateIndex":1,"candidateObservation":"Documentary photo of a woman dancing"}' },
    });

    const result = await service.resolve({
      ...request('hybrid'),
      searchQuery: 'woman dancing at dusk',
      searchDescription: 'Prefer documentary photos like «woman dancing rain». Reject portraits.',
      generationDescription: 'Use a wide shot in monochrome.',
    });

    expect(sources.searchOpenImages).toHaveBeenNthCalledWith(2, 'woman dancing rain', 1);
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      category: 'TELEGRAM_POSTING_REVIEW',
      input: expect.stringContaining('Reject portraits'),
    }));
    expect(gateway.execute.mock.calls[0][0].input).not.toContain('wide shot in monochrome');
    expect(result.image?.sourceId).toBe('openverse');
  });

  it('uses a chosen attachment and generation brief when no stock candidates are viable', async () => {
    const referenceImage = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#a86543' },
    }).jpeg().toBuffer();
    gateway.execute.mockResolvedValueOnce({
      operation: { ...operation(), category: 'TELEGRAM_POSTING_REVIEW' },
      result: { reply: '{"candidateIndex":0,"referenceIndex":2,"referenceDirection":"Backlit full-body motion"}' },
    });
    const result = await service.resolve({
      ...request('hybrid'),
      referenceImage,
      referenceGrid: { columns: 2, tileSize: 512, count: 2 },
      searchDescription: 'Look for documentary photos.',
      generationDescription: 'Use visible film grain and a wide frame.',
    });

    expect(result.readiness).toBe('READY');
    const generation = gateway.execute.mock.calls[1][0];
    expect(generation).toMatchObject({
      category: 'TELEGRAM_POSTING_IMAGE',
      input: expect.stringContaining('Use visible film grain and a wide frame.'),
    });
    expect(generation.input).toContain('Backlit full-body motion');
    expect(generation.input).not.toContain('Look for documentary photos');
    expect(await sharp(generation.image.data).metadata()).toMatchObject({ width: 512, height: 512 });
  });

  it('leaves a hybrid search-only publication without media when there is no verified source', async () => {
    const result = await service.resolve({ ...request('hybrid'), preferencePurpose: 'SEARCH' });
    expect(result).toMatchObject({ readiness: 'MISSING', image: null });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects a re-encoded copy in search and tries the next result', async () => {
    const copy = await sharp(imageBytes).resize(500).jpeg({ quality: 45 }).toBuffer();
    const fresh = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#a86543' },
    }).png().toBuffer();
    sources.downloadImage.mockResolvedValueOnce(copy).mockResolvedValueOnce(fresh);
    const usedImages = new Set([(await telegramAiPostingImageIdentity(imageBytes)).visualFingerprint]);
    const result = await service.resolve({
      ...request('found', [
        { url: 'https://source.example/copy.jpg', sourceId: 'copy', sourceType: 'website' },
        { url: 'https://source.example/fresh.png', sourceId: 'fresh', sourceType: 'website' },
      ]),
      usedImages,
    });
    expect(result.image?.sourceId).toBe('fresh');
    expect(media.persistImageBytes).toHaveBeenCalledWith([{ bytes: fresh, contentType: 'image/png' }]);
  });

  it('falls back to AI when search fails and still searches every hybrid publication', async () => {
    sources.searchOpenImages.mockRejectedValue(new Error('unavailable'));
    expect((await service.resolve(request('hybrid'))).image?.sourceId).toBe(
      'openai-image-generation',
    );
    sources.searchOpenImages.mockClear();
    const input = request('hybrid');
    expect(
      (
        await service.resolve({
          ...input,
          aiPosting: { ...input.aiPosting, publicationIndex: 1 },
        })
      ).image?.sourceId,
    ).toBe('openai-image-generation');
    expect(sources.searchOpenImages).toHaveBeenCalledWith(
      'A distinct topic',
      1,
    );
  });

  it('persists a valid found image and marks it ready', async () => {
    const result = await service.resolve(
      request('found', [
        {
          url: 'https://source.example/image.png',
          sourceId: 'site-1',
          sourceType: 'website',
        },
      ]),
    );

    expect(result).toMatchObject({
      image: { url: 'https://media.example/image.png', sourceId: 'site-1' },
      readiness: 'READY',
    });
    expect(media.persistImageBytes).toHaveBeenCalledWith([
      { bytes: imageBytes, contentType: 'image/png' },
    ]);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('marks found mode missing when there are no image candidates without a paid call', async () => {
    await expect(service.resolve(request('found'))).resolves.toMatchObject({
      image: null,
      readiness: 'MISSING',
    });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('skips broken external images and reports missing media', async () => {
    sources.downloadImage.mockRejectedValue(
      new Error('private network detail'),
    );

    const result = await service.resolve(
      request('found', [
        {
          url: 'https://source.example/broken.jpg',
          sourceId: 'site-1',
          sourceType: 'website',
        },
      ]),
    );

    expect(result).toMatchObject({ image: null, readiness: 'MISSING' });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects images that fail minimum quality requirements', async () => {
    const smallImage = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    sources.downloadImage.mockResolvedValue(smallImage);

    const result = await service.resolve(
      request('found', [
        {
          url: 'https://source.example/small.png',
          sourceId: 'site-1',
          sourceType: 'website',
        },
      ]),
    );

    expect(result).toMatchObject({ image: null, readiness: 'MISSING' });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('validates and stores a successful AI-generated image with its operation', async () => {
    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      image: {
        url: 'https://media.example/image.png',
        sourceId: 'openai-image-generation',
      },
      readiness: 'READY',
      operation: { operationId: 'image-operation-1', actualCost: '0.025' },
    });
    expect(media.persistImageBytes).toHaveBeenCalledWith([
      { bytes: imageBytes, contentType: 'image/png' },
    ]);
  });

  it('passes reference sheets as image input and adds the channel avatar watermark', async () => {
    const result = await service.resolve({
      ...request('ai'),
      referenceImage: imageBytes,
      channelAvatar: imageBytes,
      watermarkChannelAvatar: true,
    });

    expect(result.readiness).toBe('READY');
    expect(gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mime: 'image/jpeg', data: imageBytes },
      }),
    );
    const persisted = media.persistImageBytes.mock.calls[0][0][0];
    expect(persisted.contentType).toBe('image/jpeg');
    expect(persisted.bytes).not.toEqual(imageBytes);
    await expect(sharp(persisted.bytes).metadata()).resolves.toMatchObject({
      width: 400,
      height: 400,
      format: 'jpeg',
    });
  });

  it('uses a data URL channel avatar and fails visibly if it is unavailable', async () => {
    const avatarUrl = `data:image/png;base64,${imageBytes.toString('base64')}`;
    const avatar = await service.prepareChannelAvatar(avatarUrl);
    expect(avatar).toEqual(imageBytes);
    expect(sources.downloadImage).not.toHaveBeenCalled();
    const result = await service.resolve({
      ...request('ai'),
      watermarkChannelAvatar: true,
      channelAvatarUrl: avatarUrl,
    });
    expect(result.readiness).toBe('READY');
    expect(media.persistImageBytes.mock.calls[0][0][0].bytes).not.toEqual(
      imageBytes,
    );
    const missing = await service.resolve({
      ...request('ai'),
      watermarkChannelAvatar: true,
      channelAvatarUrl: 'data:image/png;base64,broken',
    });
    expect(missing).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_AVATAR_UNAVAILABLE',
    });
  });

  it('uses all eight reference images in a bounded contact sheet', async () => {
    const urls = Array.from(
      { length: 8 },
      (_, index) => `https://cdn.example/ref-${index}.jpg`,
    );
    const result = await service.prepareReferenceSheet(urls);
    expect(result.failed).toBe(false);
    expect(sources.downloadImage).toHaveBeenCalledTimes(8);
    expect(await sharp(result.image!).metadata()).toMatchObject({
      width: 1536,
      height: 1536,
    });
  });

  it('creates one bounded contact sheet from saved reference URLs', async () => {
    const result = await service.prepareReferenceSheet([
      'https://cdn.example/ref-1.jpg',
      'https://cdn.example/ref-2.jpg',
    ]);
    expect(result.failed).toBe(false);
    expect(sources.downloadImage).toHaveBeenCalledTimes(2);
    await expect(sharp(result.image!).metadata()).resolves.toMatchObject({
      width: 1024,
      height: 1024,
      format: 'jpeg',
    });
  });

  it('keeps the healthy references when another attachment cannot be downloaded', async () => {
    sources.downloadImage.mockRejectedValueOnce(new Error('unavailable'));
    const result = await service.prepareReferenceSheet([
      'https://cdn.example/broken.jpg', 'https://cdn.example/valid.jpg',
    ]);
    expect(result.failed).toBe(false);
    expect(result.image).toBeInstanceOf(Buffer);
  });

  it('does not call the image provider when configured references are unavailable', async () => {
    sources.downloadImage.mockRejectedValue(new Error('unavailable'));
    const reference = await service.prepareReferenceSheet([
      'https://cdn.example/ref.jpg',
    ]);
    const result = await service.resolve({
      ...request('ai'),
      referenceImageFailed: reference.failed,
    });
    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_REFERENCE_UNAVAILABLE',
    });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects invalid Base64 without losing the failed operation or cost', async () => {
    gateway.execute.mockResolvedValue(aiResponse('%%%invalid%%%'));

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      image: null,
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
      operation: { status: 'SUCCEEDED', actualCost: '0.025' },
    });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('rejects corrupt decoded image bytes after full image decoding', async () => {
    gateway.execute.mockResolvedValue(
      aiResponse(Buffer.from('not an image').toString('base64')),
    );

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
      operation: { actualCost: '0.025' },
    });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('keeps provider failures and their costs in the result', async () => {
    gateway.execute.mockResolvedValue(aiResponse('', 'FAILED'));

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
      operation: { status: 'FAILED', actualCost: '0.025' },
    });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('reports an image request budget rejection instead of a provider failure', async () => {
    gateway.execute.mockRejectedValue(
      new ConflictException('AI_REQUEST_BUDGET_EXCEEDED'),
    );
    expect(await service.resolve(request('ai'))).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_REQUEST_BUDGET_EXCEEDED',
    });
    expect(media.persistImageBytes).not.toHaveBeenCalled();
  });

  it('keeps settlement uncertainty distinct from a known zero image cost', async () => {
    gateway.execute.mockRejectedValue(
      new ServiceUnavailableException('AI_SETTLEMENT_UNCERTAIN'),
    );

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
      costUnknown: true,
    });
    expect(result.operation).toBeUndefined();
  });

  it('marks storage failures as failed while retaining the AI operation', async () => {
    media.persistImageBytes.mockRejectedValue(new Error('storage detail'));

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
      operation: { actualCost: '0.025' },
    });
  });

  it('reports the safe storage stage and does not pay for AI after a found image cannot be stored', async () => {
    sources.searchOpenImages.mockResolvedValue([
      {
        url: 'https://example.org/image.png',
        sourceId: 'openverse',
        sourceType: 'image-search',
      },
    ]);
    media.persistImageBytes.mockRejectedValue(
      new InternalServerErrorException('Failed to persist immutable object.'),
    );

    const result = await service.resolve(request('hybrid'));

    expect(result).toMatchObject({
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED',
    });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('falls back once in hybrid mode after all found candidates are rejected', async () => {
    sources.downloadImage.mockRejectedValue(new Error('unavailable'));

    const result = await service.resolve(
      request('hybrid', [
        {
          url: 'https://source.example/broken.jpg',
          sourceId: 'site-1',
          sourceType: 'website',
        },
      ]),
    );

    expect(result.readiness).toBe('READY');
    expect(gateway.execute).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to AI in found mode when candidates are rejected', async () => {
    sources.downloadImage.mockRejectedValue(new Error('unavailable'));

    const result = await service.resolve(
      request('found', [
        {
          url: 'https://source.example/broken.jpg',
          sourceId: 'site-1',
          sourceType: 'website',
        },
      ]),
    );

    expect(result).toMatchObject({ image: null, readiness: 'MISSING' });
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects empty or invalid persisted media URLs', async () => {
    media.persistImageBytes.mockResolvedValue(['']);

    const result = await service.resolve(request('ai'));

    expect(result).toMatchObject({
      image: null,
      readiness: 'FAILED',
      failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
      operation: { actualCost: '0.025' },
    });
  });
});
