import sharp from 'sharp';
import { ServiceUnavailableException } from '@nestjs/common';
import { TelegramAiPostingImageService } from './telegram-ai-posting-image.service';

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

  it('falls back to AI when search fails and generates directly on alternating hybrid publications', async () => {
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
    expect(sources.searchOpenImages).not.toHaveBeenCalled();
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
