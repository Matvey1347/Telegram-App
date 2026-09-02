import { Test } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { TelegramAdSalesService } from '../telegram-ad-sales/telegram-ad-sales.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';

describe('Telegram channels module integration', () => {
  it('exports every narrow channel provider required by Ad Sales', async () => {
    const previousKey = process.env.BOT_TOKEN_ENCRYPTION_KEY;
    const previousJwtSecret = process.env.JWT_SECRET;
    process.env.BOT_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    process.env.JWT_SECRET = 'telegram-channels-module-test-secret';
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(TokenEncryptionService)
        .useValue({ encrypt: jest.fn(), decrypt: jest.fn() })
        .compile();

      expect(await moduleRef.resolve(TelegramAdSalesService)).toBeInstanceOf(
        TelegramAdSalesService,
      );

      await moduleRef.close();
    } finally {
      if (previousKey === undefined)
        delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
      else process.env.BOT_TOKEN_ENCRYPTION_KEY = previousKey;
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
    }
  });
});
