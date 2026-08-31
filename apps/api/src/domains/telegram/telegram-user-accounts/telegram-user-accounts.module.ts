import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramUserAccountsController } from './telegram-user-accounts.controller';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';
import { TelegramUserAccountLoginFinalizer } from './telegram-user-account-login-finalizer';
import { TelegramUserAccountQrLoginService } from './telegram-user-account-qr-login.service';
import { TelegramUserAccountRemovalService } from './telegram-user-account-removal.service';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [TelegramUserAccountsController],
  providers: [
    TelegramUserAccountsService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
    TelegramUserAccountLoginFinalizer,
    TelegramUserAccountQrLoginService,
    TelegramUserAccountRemovalService,
  ],
  exports: [TelegramUserAccountsService],
})
export class TelegramUserAccountsModule {}
