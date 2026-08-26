import { BadRequestException } from '@nestjs/common';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';
import sharp from 'sharp';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';

describe('TelegramManagedPostMediaStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('unwraps a Next image proxy and persists the original image in B2', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
    ]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    );
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/bucket/telegram/post-images/image.png'],
      uploaded: 1,
      reused: 0,
    });
    const storage = {
      persistImmutableImages,
    } as unknown as B2ObjectStorageService;
    const service = new TelegramManagedPostMediaStorageService(storage);

    await expect(
      service.persistImageUrls([
        'https://site.test/_next/image/?url=https%3A%2F%2Forigin.test%2Fimage.png&w=640&q=50',
      ]),
    ).resolves.toEqual([
      'https://s3.example.test/bucket/telegram/post-images/image.png',
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('https://origin.test/image.png'),
      expect.any(Object),
    );
    expect(persistImmutableImages).toHaveBeenCalledWith([
      { bytes: png, mimeType: 'image/png' },
    ]);
  });

  it('uses a bounded image proxy fallback when the source blocks the API', async () => {
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array(webp), { status: 200 }),
      );
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/telegram/post-images/image.webp'],
      uploaded: 1,
      reused: 0,
    });
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await service.persistImageUrls(['https://blocked.test/image.webp']);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toEqual(
      expect.objectContaining({ hostname: 'wsrv.nl' }),
    );
    expect(persistImmutableImages).toHaveBeenCalledWith([
      { bytes: webp, mimeType: 'image/webp' },
    ]);
  });

  it('uses the public resize variant for protected st-note assets', async () => {
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array(webp), { status: 200 }),
      );
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn().mockResolvedValue({
        urls: ['https://s3.example.test/telegram/post-images/image.webp'],
        uploaded: 1,
        reused: 0,
      }),
    } as unknown as B2ObjectStorageService);

    await service.persistImageUrls([
      'https://assets.st-note.com/img/protected.jpg',
    ]);

    expect(fetchSpy.mock.calls[1][0]).toEqual(
      expect.objectContaining({ search: '?width=1200' }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not download images that are already stored', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const persistImmutableImages = jest.fn();
    const storage = {
      persistImmutableImages,
    } as unknown as B2ObjectStorageService;
    const service = new TelegramManagedPostMediaStorageService(storage);
    const url =
      'https://s3.example.test/bucket/telegram/post-images/aa/bb/image.jpg';

    await expect(service.persistImageUrls([url])).resolves.toEqual([url]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(persistImmutableImages).not.toHaveBeenCalled();
  });

  it('persists Telegram-downloaded image bytes without exposing a token URL', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/telegram/post-images/image.jpg'],
      uploaded: 1,
      reused: 0,
    });
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageBytes([
        { bytes: jpeg, contentType: 'application/octet-stream' },
      ]),
    ).resolves.toEqual([
      'https://s3.example.test/telegram/post-images/image.jpg',
    ]);
    expect(persistImmutableImages).toHaveBeenCalledWith([
      { bytes: jpeg, mimeType: 'image/jpeg' },
    ]);
  });

  it('rejects invalid Telegram-downloaded image bytes', async () => {
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn(),
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageBytes([
        { bytes: Buffer.from('not-an-image'), contentType: 'text/plain' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes formats such as AVIF to a B2-supported WebP image', async () => {
    const avif = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#336699',
      },
    })
      .avif()
      .toBuffer();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(avif), {
        status: 200,
        headers: { 'content-type': 'image/avif' },
      }),
    );
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/telegram/post-images/image.webp'],
      uploaded: 1,
      reused: 0,
    });
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await service.persistImageUrls(['https://cdn.test/image.avif']);

    expect(persistImmutableImages).toHaveBeenCalledWith([
      expect.objectContaining({ mimeType: 'image/webp' }),
    ]);
  });

  it('rejects an unavailable image before a post is saved', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('', { status: 429 }));
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn(),
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageUrls(['https://cdn.test/rate-limited.jpg']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
