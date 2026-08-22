import { Test } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { TelegramAdSalesService } from '../telegram-ad-sales/telegram-ad-sales.service';

describe('Telegram channels module integration', () => {
  it('exports every narrow channel provider required by Ad Sales', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(await moduleRef.resolve(TelegramAdSalesService)).toBeInstanceOf(
      TelegramAdSalesService,
    );

    await moduleRef.close();
  });
});
