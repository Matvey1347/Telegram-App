import sharp from 'sharp';
import { downloadTelegramPublishImage } from './telegram-mtproto-publish-image';

describe('downloadTelegramPublishImage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retrieves a public image through the protected-image fallback after HTTP 403', async () => {
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#336699',
      },
    })
      .webp()
      .toBuffer();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('blocked', {
          status: 403,
          headers: { 'content-type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from(image).buffer, {
          status: 200,
          headers: {
            'content-type': 'image/webp',
            'content-length': String(image.length),
          },
        }),
      );

    const file = await downloadTelegramPublishImage(
      'https://protected.example.test/post.webp',
      0,
    );

    expect(file.name).toBe('telegram-post-1.jpg');
    expect(file.size).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fallbackRequest = fetchSpy.mock.calls[1]?.[0];
    expect(fallbackRequest).toBeInstanceOf(URL);
    expect((fallbackRequest as URL).toString()).toMatch(
      /^https:\/\/images\.weserv\.nl\/\?url=/,
    );
  });

  it('does not hide a genuine missing-image response behind the fallback', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('missing', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await expect(
      downloadTelegramPublishImage(
        'https://images.example.test/missing.jpg',
        0,
      ),
    ).rejects.toThrow('Could not download image 1 (HTTP 404)');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
