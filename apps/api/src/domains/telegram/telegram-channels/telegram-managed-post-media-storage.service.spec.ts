import { BadRequestException } from '@nestjs/common';
import { B2ObjectStorageService } from '../../../common/object-storage/b2-object-storage.service';
import sharp from 'sharp';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';

describe('TelegramManagedPostMediaStorageService', () => {
  it('keeps external HTTP image URLs without downloading or storing them', async () => {
    const persistImmutableImages = jest.fn();
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageUrls([
        'https://images.example.test/post.jpg?width=1200',
        'http://cdn.example.test/second.png',
      ]),
    ).resolves.toEqual([
      'https://images.example.test/post.jpg?width=1200',
      'http://cdn.example.test/second.png',
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(persistImmutableImages).not.toHaveBeenCalled();
  });

  it('rejects invalid and non-HTTP image URLs', async () => {
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn(),
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageUrls(['file:///tmp/image.png']),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_POST_MEDIA_URL_INVALID',
        message: 'Image 1 must use a valid HTTP or HTTPS URL.',
        params: { index: 1 },
      },
    });
    await expect(
      service.persistImageUrls(['not-a-url']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists uploaded or Telegram-downloaded image bytes in B2', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/telegram/post-images/image.jpg'],
      uploaded: 1,
      reused: 0,
    });
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await expect(service.persistImageBytes([{ bytes: jpeg }])).resolves.toEqual(
      ['https://s3.example.test/telegram/post-images/image.jpg'],
    );
    expect(persistImmutableImages).toHaveBeenCalledWith([
      { bytes: jpeg, mimeType: 'image/jpeg' },
    ]);
  });

  it('rejects invalid uploaded image bytes', async () => {
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn(),
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageBytes([{ bytes: Buffer.from('not-an-image') }]),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_POST_MEDIA_INVALID',
        message: 'File 1 is not a valid image.',
        params: { index: 1 },
      },
    });
  });

  it('reports image size limits with stable interpolation params', async () => {
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages: jest.fn(),
    } as unknown as B2ObjectStorageService);

    await expect(
      service.persistImageBytes([
        { bytes: Buffer.alloc(10 * 1024 * 1024 + 1) },
      ]),
    ).rejects.toMatchObject({
      response: {
        code: 'TELEGRAM_POST_MEDIA_TOO_LARGE',
        message: 'Image 1 is larger than 10 MB.',
        params: { index: 1, maxMegabytes: 10 },
      },
    });
  });

  it('normalizes uploaded formats such as AVIF to WebP', async () => {
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
    const persistImmutableImages = jest.fn().mockResolvedValue({
      urls: ['https://s3.example.test/telegram/post-images/image.webp'],
      uploaded: 1,
      reused: 0,
    });
    const service = new TelegramManagedPostMediaStorageService({
      persistImmutableImages,
    } as unknown as B2ObjectStorageService);

    await service.persistImageBytes([{ bytes: avif }]);

    expect(persistImmutableImages).toHaveBeenCalledWith([
      expect.objectContaining({ mimeType: 'image/webp' }),
    ]);
  });
});
