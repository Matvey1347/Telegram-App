import { Module } from '@nestjs/common';
import { TelegramChannelMessageTemplatesController } from './telegram-channel-message-templates.controller';
import { TelegramChannelMessageTemplatesService } from './telegram-channel-message-templates.service';

@Module({
  controllers: [TelegramChannelMessageTemplatesController],
  providers: [TelegramChannelMessageTemplatesService],
})
export class TelegramChannelMessageTemplatesModule {}
