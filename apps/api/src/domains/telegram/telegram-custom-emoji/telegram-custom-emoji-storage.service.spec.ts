import { telegramCustomEmojiBrowserCorsRule } from './telegram-custom-emoji-storage.service';

describe('Telegram custom emoji B2 browser CORS rule', () => {
  it('allows S3 GET requests used by browser-hosted Lottie render assets', () => {
    expect(telegramCustomEmojiBrowserCorsRule.allowedOperations).toEqual([
      'b2_download_file_by_name',
      's3_get',
    ]);
  });
});
