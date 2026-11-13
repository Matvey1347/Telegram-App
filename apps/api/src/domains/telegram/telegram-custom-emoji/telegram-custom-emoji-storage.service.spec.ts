import { ConfigService } from '@nestjs/config';
import {
  TelegramCustomEmojiStorageService,
  telegramCustomEmojiBrowserCorsRule,
} from './telegram-custom-emoji-storage.service';

describe('Telegram custom emoji B2 browser CORS rule', () => {
  it('allows S3 GET requests used by browser-hosted Lottie render assets', () => {
    expect(telegramCustomEmojiBrowserCorsRule.allowedOperations).toEqual([
      'b2_download_file_by_name',
      's3_get',
    ]);
  });
});

describe('TelegramCustomEmojiStorageService', () => {
  it('uploads emoji assets without requiring bucket administration permissions', async () => {
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            B2_KEY_ID: 'key-id',
            B2_APP_KEY: 'app-key',
            B2_BUCKET_NAME: 'assets',
            B2_ENDPOINT: 'https://cdn.example/assets',
          })[key],
      ),
    } as unknown as ConfigService;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            apiUrl: 'https://api.example',
            authorizationToken: 'token',
            accountId: 'account',
            downloadUrl: 'https://download.example',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            buckets: [{ bucketId: 'bucket', bucketName: 'assets' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadUrl: 'https://upload.example',
            authorizationToken: 'upload-token',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }));

    const urls = await new TelegramCustomEmojiStorageService(config).uploadMany(
      [
        {
          key: 'emoji/static.webp',
          bytes: Buffer.from('asset'),
          mimeType: 'image/webp',
        },
      ],
    );

    expect(urls.get('emoji/static.webp')).toBe(
      'https://cdn.example/assets/emoji/static.webp',
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      'https://api.example/b2api/v2/b2_update_bucket',
    );
    fetchMock.mockRestore();
  });
});
