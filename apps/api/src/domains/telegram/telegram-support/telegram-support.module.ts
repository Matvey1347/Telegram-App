import { Module } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../telegram/shared/bot/telegram-bot-api.client';
import { SupportBotsService } from './support-bots.service';
import {
  SupportController,
  SupportWebhookController,
} from './support.controller';
import { SupportTicketsService } from './support-tickets.service';

@Module({
  exports: [SupportBotsService],
  controllers: [SupportController, SupportWebhookController],
  providers: [SupportBotsService, SupportTicketsService, TelegramBotApiClient],
})
export class TelegramSupportModule {}
